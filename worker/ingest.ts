import { Octokit } from "@octokit/rest";
import {
  type QueueData,
  type QueueMergedPullRequest,
  type QueuePullRequest,
  writeQueueData,
} from "./queueStore";

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

export async function ingest(env: Env): Promise<void> {
  const octokit = new Octokit({
    auth: env.GITHUB_TOKEN,
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
    const [openPlugins, openThemes, mergedPlugins, mergedThemes] =
      await Promise.all([
        searchGitHubIssues(octokit, openPluginsQuery),
        searchGitHubIssues(octokit, openThemesQuery),
        searchGitHubIssues(octokit, mergedPluginsQuery),
        searchGitHubIssues(octokit, mergedThemesQuery),
      ]);
    const queueData: QueueData = {
      openPrs: buildOpenPrPayload([...openPlugins, ...openThemes]),
      mergedPrs: buildMergedPrPayload([...mergedPlugins, ...mergedThemes]),
    };

    await writeQueueData(env, queueData);
    console.debug("[Ingest] KV update complete.");
  } catch (error) {
    console.error(
      "[Ingest] Failed to fetch data from GitHub or update KV:",
      error,
    );
  }
}
