import { Octokit } from "@octokit/rest";
import { buildWeeklyMergedSummary, computeWaitEstimate } from "./metrics";
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
import { type IngestLogEntry, createIngestLogger, describeError } from "./log";

const REVIEW_TYPES = ["plugin", "theme"] as const;
const READY_FOR_REVIEW_LABEL = "Ready for review";
const GITHUB_OWNER = "obsidianmd";
const GITHUB_REPO = "obsidian-releases";

type ReviewAssetType = (typeof REVIEW_TYPES)[number];
type ReviewAssetTypeWithFallback = ReviewAssetType | "unknown";

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

interface IngestResult {
  ok: boolean;
  message: string;
  logs: IngestLogEntry[];
  error?: string;
  detailsUpdated?: boolean;
  summaryUpdated?: boolean;
  detailsVersion?: string;
  checkedAt?: string;
}

/**
 * Fetch paginated GitHub search results for the provided query.
 *
 * The search API caps responses at 1,000 items; this helper automatically
 * traverses the pages so callers receive the combined dataset.
 *
 * @param octokit - Authenticated Octokit instance tied to our OAuth token.
 * @param q - The GitHub search query string to execute.
 * @returns All search items returned by the API.
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

/**
 * Determine whether a PR belongs to the plugin or theme review queue.
 *
 * GitHub PR labels contain the data we need; this helper normalises the value
 * for downstream consumers. If no recognised label is present we fall back to
 * `"unknown"` which is excluded from queue totals.
 *
 * @param pr - The GitHub search result to inspect.
 * @returns The queue type label if present, otherwise `"unknown"`.
 */
function resolvePrType(pr: GitHubPr): ReviewAssetTypeWithFallback {
  const typeLabel = pr.labels.find((label) =>
    REVIEW_TYPES.includes(label.name as ReviewAssetType),
  );
  return (typeLabel?.name as ReviewAssetTypeWithFallback) ?? "unknown";
}

/**
 * Build the GitHub search query for open items of a specific review type.
 *
 * @param type - The review queue label to query.
 * @returns A ready-to-run GitHub search string.
 */
function buildOpenSearchQuery(type: ReviewAssetType): string {
  return `is:pr repo:${GITHUB_OWNER}/${GITHUB_REPO} state:open label:"${READY_FOR_REVIEW_LABEL}" label:${type}`;
}

/**
 * Build the GitHub search query for merged items after a given date.
 *
 * @param since - ISO date string (YYYY-MM-DD) to bound the merged date filter.
 * @param type - The review queue label to query.
 * @returns A ready-to-run GitHub search string.
 */
function buildMergedSearchQuery(since: string, type: ReviewAssetType): string {
  return `is:pr repo:${GITHUB_OWNER}/${GITHUB_REPO} is:merged merged:>${since} label:${type}`;
}

/**
 * Transform open pull requests from the GitHub API into queue-ready rows.
 *
 * @param prs - Raw GitHub search results representing open PRs.
 * @returns Sorted queue entries ordered by creation date (oldest first).
 */
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

/**
 * Transform merged pull requests into queue history rows.
 *
 * @param prs - Raw GitHub search results representing merged PRs.
 * @returns Sorted queue history entries ordered by merge date (oldest first).
 */
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

/**
 * Produce a deterministic hash for the given string content.
 *
 * Cloudflare Workers expose the Web Crypto API, enabling us to generate a
 * SHA-256 hex digest equal to what browsers or Node produce.
 *
 * @param value - The input string to hash.
 * @returns Hex-encoded SHA-256 digest.
 */
async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fetch the latest queue data from GitHub and persist normalised snapshots.
 *
 * The ingest run retrieves open and recently merged PRs for the Obsidian
 * release queues, projects them into consistent payloads, and stores a summary
 * alongside the full details in KV. Rewrites of the larger details record only
 * occur when the content hash changes to minimise storage churn.
 *
 * @param env - Worker bindings including KV namespace and OAuth secrets.
 */
export async function ingest(env: Env): Promise<IngestResult> {
  const logger = createIngestLogger();
  let detailsUpdated = false;
  let summaryUpdated = false;

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
      logger.debug(
        `[GitHub] remain=${remain} used=${used} reset=${reset} route=${options.method} ${options.url}`,
      );
    }
  });

  try {
    logger.info("[Ingest] Fetching open plugins and themes...");
    const openPluginsQuery = buildOpenSearchQuery("plugin");
    const openThemesQuery = buildOpenSearchQuery("theme");

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    const mergedQueryDate = twelveMonthsAgo.toISOString().slice(0, 10);
    const mergedPluginsQuery = buildMergedSearchQuery(
      mergedQueryDate,
      "plugin",
    );
    const mergedThemesQuery = buildMergedSearchQuery(mergedQueryDate, "theme");

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
      detailsUpdated = true;
      logger.info(`[Ingest] Details updated (version ${detailsVersion})`);
    } else {
      logger.debug("[Ingest] No changes detected, details update skipped.");
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
    summaryUpdated = true;

    const completeMessage = "[Ingest] Summary update complete.";
    logger.info(completeMessage);
    return {
      ok: true,
      message: completeMessage,
      logs: logger.entries,
      detailsUpdated,
      summaryUpdated,
      detailsVersion,
      checkedAt: summary.checkedAt,
    };
  } catch (error) {
    const errorMessage =
      "[Ingest] Failed to fetch data from GitHub or update KV.";
    logger.error(errorMessage, error);
    return {
      ok: false,
      message: errorMessage,
      error: describeError(error),
      logs: logger.entries,
      detailsUpdated,
      summaryUpdated,
    };
  }
}
