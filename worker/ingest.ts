import { Octokit } from "@octokit/rest";
import { GH_HEADERS_BASE, getGitHubAccessToken } from "./oauth";
import {
  type QueueDetails,
  type QueueMergedPullRequest,
  type QueuePullRequest,
  type QueueSummary,
  readQueueSummary,
  writeQueueDetails,
  writeQueueSummary,
} from "./queueStore";
import { buildWeeklyMergedSummary, computeWaitEstimate } from "./metrics";

// This interface is a subset of the GitHub API response for search results
// and is what we'll use for type safety in our application.
interface GitHubPr {
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  pull_request?: {
    merged_at?: string | null;
  };
  labels: {
    name: string;
  }[];
  user: {
    login: string;
  } | null;
}

/**
 * Fetches paginated results from the GitHub search API.
 * @param octokit - An authenticated Octokit instance.
 * @param q - The search query string.
 * @returns A promise that resolves to an array of PR/issue data.
 */
async function searchGitHubIssues(
  octokit: Octokit,
  q: string,
): Promise<GitHubPr[]> {
  const results = await octokit.paginate("GET /search/issues", {
    q,
    per_page: 100,
  });
  return results as GitHubPr[];
}

function resolvePrType(pr: GitHubPr): string {
  const typeLabel = pr.labels.find(
    (label) => label.name === "plugin" || label.name === "theme",
  );
  return typeLabel ? typeLabel.name : "unknown";
}

function buildOpenPrPayload(prs: GitHubPr[]): QueuePullRequest[] {
  const mapped = prs.map<QueuePullRequest>((pr) => ({
    id: pr.number,
    title: pr.title,
    url: pr.html_url,
    type: resolvePrType(pr),
    createdAt: pr.created_at,
  }));

  return mapped.sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

function buildMergedPrPayload(prs: GitHubPr[]): QueueMergedPullRequest[] {
  const mapped = prs
    .filter((pr) => pr.pull_request && pr.pull_request.merged_at)
    .map<QueueMergedPullRequest>((pr) => {
      const createdAt = new Date(pr.created_at);
      const mergedAtIso = pr.pull_request!.merged_at!;
      const mergedAt = new Date(mergedAtIso);
      const daysToMerge = Math.round(
        (mergedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      return {
        id: pr.number,
        title: pr.title,
        url: pr.html_url,
        type: resolvePrType(pr),
        createdAt: pr.created_at,
        mergedAt: mergedAtIso,
        daysToMerge,
      } satisfies QueueMergedPullRequest;
    });

  return mapped.sort((a, b) => {
    return new Date(a.mergedAt).getTime() - new Date(b.mergedAt).getTime();
  });
}

async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ingest(env: Env): Promise<void> {
  // Get a fresh user token
  const token = await getGitHubAccessToken(env);

  const octokit = new Octokit({
    request: {
      // Default headers for every request
      headers: {
        ...GH_HEADERS_BASE,
        // authorization: `Bearer ${token}`,
      },
      // Workers runtime already has global fetch; Octokit will use it.
    },
  });

  octokit.hook.before("request", async (options) => {
    options.headers = {
      ...(options.headers || {}),
      authorization: `Bearer ${token}`,
    };
    // console.debug(`[GitHub] ${options.method} ${options.url} requested`);
    // console.debug(`[GitHub] Headers: ${JSON.stringify(options.headers, null, 2)}`);
  });

  // Log rate limit info after each request for debugging
  octokit.hook.after("request", async (response, options) => {
    const remain = response.headers["x-ratelimit-remaining"];
    const used = response.headers["x-ratelimit-used"];
    const reset = response.headers["x-ratelimit-reset"];
    if (remain !== undefined) {
      console.debug(
        `[GitHub] remain=${remain} used=${used} reset=${reset} route=${options.method} ${options.url}`,
      );
    }
  });

  const owner = "obsidianmd";
  const repo = "obsidian-releases";

  console.debug("[Ingest] Fetching open plugins and themes...");
  const openPluginsQuery = `is:pr repo:${owner}/${repo} state:open label:"Ready for review" label:plugin`;
  const openThemesQuery = `is:pr repo:${owner}/${repo} state:open label:"Ready for review" label:theme`;

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const mergedQueryDate = twelveMonthsAgo.toISOString().split("T")[0];
  const mergedPluginsQuery = `is:pr repo:${owner}/${repo} is:merged merged:>${mergedQueryDate} label:plugin`;
  const mergedThemesQuery = `is:pr repo:${owner}/${repo} is:merged merged:>${mergedQueryDate} label:theme`;

  try {
    // Fetch queries sequentially as per GitHub API best practices
    // https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
    const openPlugins = await searchGitHubIssues(octokit, openPluginsQuery);
    const openThemes = await searchGitHubIssues(octokit, openThemesQuery);
    const mergedPlugins = await searchGitHubIssues(octokit, mergedPluginsQuery);
    const mergedThemes = await searchGitHubIssues(octokit, mergedThemesQuery);

    const queueDetails: QueueDetails = {
      openPrs: buildOpenPrPayload([...openPlugins, ...openThemes]),
      mergedPrs: buildMergedPrPayload([...mergedPlugins, ...mergedThemes]),
    };

    const detailsJson = JSON.stringify(queueDetails);
    const detailsVersion = await hashString(detailsJson);
    const nowIso = new Date().toISOString();

    const previousSummary = await readQueueSummary(env);
    let detailsUpdatedAt = previousSummary?.detailsUpdatedAt ?? nowIso;

    if (!previousSummary || previousSummary.detailsVersion !== detailsVersion) {
      await writeQueueDetails(env, queueDetails);
      detailsUpdatedAt = nowIso;
      console.debug(`[Ingest] Details updated (version ${detailsVersion})`);
    } else {
      console.debug("[Ingest] No changes detected, details update skipped.");
    }

    const totals = queueDetails.openPrs.reduce(
      (acc, pr) => {
        acc.readyTotal += 1;
        if (pr.type === "plugin") {
          acc.readyPlugins += 1;
        } else if (pr.type === "theme") {
          acc.readyThemes += 1;
        }
        return acc;
      },
      { readyTotal: 0, readyPlugins: 0, readyThemes: 0 },
    );

    const waitEstimates = {
      plugin: computeWaitEstimate(queueDetails.mergedPrs, "plugin"),
      theme: computeWaitEstimate(queueDetails.mergedPrs, "theme"),
    };

    const weeklyMerged = buildWeeklyMergedSummary(queueDetails.mergedPrs);

    const summary: QueueSummary = {
      checkedAt: nowIso,
      detailsVersion,
      detailsUpdatedAt,
      totals,
      waitEstimates,
      weeklyMerged,
    };

    await writeQueueSummary(env, summary);
    console.debug("[Ingest] Summary update complete.");
  } catch (error) {
    console.error(
      "[Ingest] Failed to fetch data from GitHub or update KV:",
      error,
    );
  }
}
