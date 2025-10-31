import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";
import { buildWeeklyMergedSummary, computeWaitEstimate } from "./metrics";
import {
  GH_HEADERS_BASE,
  getGitHubInstallationToken,
  invalidateGitHubInstallationToken,
} from "./githubAuth";
import {
  type MergedPullRequest,
  type PullRequest,
  type QueueSummary,
} from "../shared/queueSchema";
import { readQueueSummary, writeQueueSummary } from "./queueStore";
import {
  readDatasetJSON,
  writeDatasetJSON,
  type DatasetPointer,
} from "./datasetCache";
import { type IngestLogEntry, createIngestLogger, describeError } from "./log";

const REVIEW_TYPES = ["plugin", "theme"] as const;
const READY_FOR_REVIEW_LABEL = "Ready for review";
const GITHUB_OWNER = "obsidianmd";
const GITHUB_REPO = "obsidian-releases";
const OPEN_QUEUE_DATASET = "queue-open";
const MERGED_HISTORY_DATASET = "queue-merged";

function normalizeBaseUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const normalized = new URL(raw);
    return normalized.toString();
  } catch (error) {
    console.warn(
      `[Ingest] Ignoring invalid PUBLIC_BASE_URL value "${raw}":`,
      error,
    );
    return undefined;
  }
}

type ReviewAssetType = (typeof REVIEW_TYPES)[number];
type ReviewAssetTypeWithFallback = ReviewAssetType | "unknown";

type IngestLogger = ReturnType<typeof createIngestLogger>;

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
  summaryUpdated?: boolean;
  openDatasetUpdated?: boolean;
  mergedDatasetUpdated?: boolean;
  openDatasetVersion?: string;
  mergedDatasetVersion?: string;
  checkedAt?: string;
  forced: boolean;
}

interface IngestOptions {
  force?: boolean;
}

/**
 * Fetch paginated GitHub search results for the provided query.
 *
 * The search API caps responses at 1,000 items; this helper automatically
 * traverses the pages so callers receive the combined dataset.
 *
 * @param octokit - Authenticated Octokit instance tied to our installation token.
 * @param q - The GitHub search query string to execute.
 * @returns All search items returned by the API.
 */
const SEARCH_PAGE_SIZE = 100;

async function searchGitHubIssues(
  octokit: Octokit,
  q: string,
  logger: IngestLogger,
): Promise<GitHubPr[]> {
  const aggregated: GitHubPr[] = [];
  let page = 1;

  while (true) {
    const response = await octokit.request("GET /search/issues", {
      q,
      per_page: SEARCH_PAGE_SIZE,
      page,
    });

    const { items, total_count } = response.data as {
      items: GitHubPr[];
      total_count: number;
    };

    aggregated.push(...items);
    logger.debug(
      `[GitHub] search page ${page} fetched ${items.length} items (total so far ${aggregated.length}/${total_count}).`,
    );

    if (aggregated.length >= Math.min(total_count, 1000)) {
      break;
    }
    if (items.length < SEARCH_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return aggregated;
}

const ISSUES_PAGE_SIZE = 100;
const MERGED_HISTORY_LOOKBACK_MONTHS = 12;

interface ReadyForReviewFetchResult {
  prs: GitHubPr[];
  page1ETag: string | null;
  notModified: boolean;
}

async function hasNewMergedPullRequests(
  octokit: Octokit,
  since: string,
  logger: IngestLogger,
): Promise<boolean> {
  const query = buildMergedTripwireQuery(since);
  const response = await octokit.request("GET /search/issues", {
    q: query,
    per_page: 1,
    sort: "updated",
    order: "desc",
  });

  const { total_count } = response.data as { total_count: number };
  const changed = total_count > 0;
  logger.debug(
    `[GitHub] merged tripwire since ${since}: ${changed ? "changes detected" : "no changes"}.`,
  );
  return changed;
}

async function fetchReadyForReviewPullRequests(
  octokit: Octokit,
  logger: IngestLogger,
  ifNoneMatch: string | null,
): Promise<ReadyForReviewFetchResult> {
  const baseRequest = {
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    state: "open" as const,
    labels: READY_FOR_REVIEW_LABEL,
    per_page: ISSUES_PAGE_SIZE,
    sort: "updated" as const,
    direction: "desc" as const,
  };

  let page1Response;
  try {
    page1Response = await octokit.request(
      "GET /repos/{owner}/{repo}/issues",
      ifNoneMatch
        ? {
            ...baseRequest,
            page: 1,
            headers: { "If-None-Match": ifNoneMatch },
          }
        : { ...baseRequest, page: 1 },
    );
  } catch (error) {
    if (error instanceof RequestError && error.status === 304) {
      logger.info("[Ingest] Open queue unchanged (304). Skipping fetch.");
      return {
        prs: [],
        page1ETag: ifNoneMatch ?? null,
        notModified: true,
      };
    }
    throw error;
  }

  const etag = page1Response.headers.etag ?? null;
  const collected = (page1Response.data as GitHubPr[]).filter(
    (item) => item.pull_request,
  );

  logger.debug(
    `[GitHub] issues page 1 fetched ${collected.length} pull requests.`,
  );

  let page = 2;
  let previousPageSize = collected.length;

  while (previousPageSize === ISSUES_PAGE_SIZE) {
    const response = await octokit.request("GET /repos/{owner}/{repo}/issues", {
      ...baseRequest,
      page,
    });

    const pageItems = (response.data as GitHubPr[]).filter(
      (item) => item.pull_request,
    );
    collected.push(...pageItems);
    previousPageSize = pageItems.length;
    logger.debug(
      `[GitHub] issues page ${page} fetched ${pageItems.length} pull requests (total so far ${collected.length}).`,
    );
    page += 1;
  }

  return { prs: collected, page1ETag: etag, notModified: false };
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
 * Build the GitHub search query for merged items after a given date.
 *
 * @param since - ISO date string (YYYY-MM-DD) to bound the merged date filter.
 * @returns A tripwire query detecting any merged PRs after the given date.
 */
function buildMergedTripwireQuery(since: string): string {
  return `is:pr repo:${GITHUB_OWNER}/${GITHUB_REPO} is:merged merged:>${since}`;
}

/**
 * Build the GitHub search query for merged items after a given date for a specific queue.
 *
 * @param since - ISO date string (YYYY-MM-DD) to bound the merged date filter.
 * @param type - The queue label (plugin or theme).
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
function buildOpenPrPayload(prs: GitHubPr[]): PullRequest[] {
  const mapped = prs
    .map<PullRequest>((pr) => ({
      id: pr.number,
      title: pr.title,
      url: pr.html_url,
      type: resolvePrType(pr),
      createdAt: pr.created_at,
    }))
    .filter((pr) => pr.type !== "unknown");

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
function buildMergedPrPayload(prs: GitHubPr[]): MergedPullRequest[] {
  const seen = new Set<number>();
  const mapped = prs
    .filter((pr) => pr.pull_request && pr.pull_request.merged_at)
    .filter((pr) => {
      if (seen.has(pr.number)) {
        return false;
      }
      seen.add(pr.number);
      return true;
    })
    .map<MergedPullRequest>((pr) => {
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
      } satisfies MergedPullRequest;
    });

  return mapped.sort((a, b) => {
    return new Date(a.mergedAt).getTime() - new Date(b.mergedAt).getTime();
  });
}

function computeLatestMergedAt(merged: MergedPullRequest[]): string | null {
  let latest: string | null = null;
  for (const pr of merged) {
    if (
      !latest ||
      new Date(pr.mergedAt).getTime() > new Date(latest).getTime()
    ) {
      latest = pr.mergedAt;
    }
  }
  return latest;
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
 * @param env - Worker bindings including KV namespace and GitHub App secrets.
 */
export async function ingest(
  env: Env,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const logger = createIngestLogger();
  let openDatasetUpdated = false;
  let mergedDatasetUpdated = false;
  let summaryUpdated = false;
  const force = options.force === true;
  const datasetBaseUrl = normalizeBaseUrl(env.PUBLIC_BASE_URL);

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
    const token = await getGitHubInstallationToken(env);
    options.headers = {
      ...(options.headers || {}),
      authorization: `Bearer ${token}`,
    };
    // console.debug(`[GitHub] ${options.method} ${options.url} requested`);
    // console.debug(`[GitHub] Headers: ${JSON.stringify(options.headers, null, 2)}`);
  });

  octokit.hook.error("request", async (error) => {
    if (
      error instanceof RequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      invalidateGitHubInstallationToken();
    }
    throw error;
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
    const previousSummary = await readQueueSummary(env);
    const previousOpenPointer = previousSummary?.datasets?.openQueue ?? null;
    const previousMergedPointer =
      previousSummary?.datasets?.mergedHistory ?? null;

    if (force) {
      logger.info(
        "[Ingest] Force refresh requested; bypassing cache tripwires.",
      );
    }

    const previousPage1ETag = force
      ? null
      : (previousSummary?.page1ETag ?? null);

    logger.info("[Ingest] Fetching Ready for review pull requests...");
    let openResult = await fetchReadyForReviewPullRequests(
      octokit,
      logger,
      previousPage1ETag,
    );

    if (openResult.notModified && !previousOpenPointer) {
      logger.info(
        "[Ingest] Received 304 but no cached open dataset; retrying without ETag.",
      );
      openResult = await fetchReadyForReviewPullRequests(octokit, logger, null);
    }

    let page1ETag = openResult.page1ETag ?? previousPage1ETag ?? null;

    let openPrs: PullRequest[];
    if (openResult.notModified) {
      const cached = await readDatasetJSON<PullRequest[]>(
        env.QUEUE_DATA,
        OPEN_QUEUE_DATASET,
      );
      if (!cached) {
        throw new Error(
          "Open queue unchanged but cached dataset unavailable in KV.",
        );
      }
      openPrs = cached;
    } else {
      openPrs = buildOpenPrPayload(openResult.prs);
      page1ETag = openResult.page1ETag;
    }

    let mergedNeedsRefresh = force || !previousMergedPointer;
    const previousMergedWatermark = previousSummary?.latestMergedAt ?? null;
    if (!mergedNeedsRefresh) {
      if (!previousMergedWatermark) {
        logger.debug("[Ingest] Missing merged watermark; forcing refresh.");
        mergedNeedsRefresh = true;
      } else {
        mergedNeedsRefresh = await hasNewMergedPullRequests(
          octokit,
          previousMergedWatermark,
          logger,
        );
      }
    }

    let mergedPrs: MergedPullRequest[];
    if (mergedNeedsRefresh) {
      logger.info("[Ingest] Fetching merged history...");
      const mergedSince = new Date();
      mergedSince.setMonth(
        mergedSince.getMonth() - MERGED_HISTORY_LOOKBACK_MONTHS,
      );
      const mergedQueryDate = mergedSince.toISOString().slice(0, 10);
      const mergedPluginQuery = buildMergedSearchQuery(
        mergedQueryDate,
        "plugin",
      );
      const mergedThemeQuery = buildMergedSearchQuery(mergedQueryDate, "theme");
      const mergedPlugins = await searchGitHubIssues(
        octokit,
        mergedPluginQuery,
        logger,
      );
      const mergedThemes = await searchGitHubIssues(
        octokit,
        mergedThemeQuery,
        logger,
      );
      mergedPrs = buildMergedPrPayload([...mergedPlugins, ...mergedThemes]);
    } else {
      logger.info("[Ingest] Merged history unchanged; reusing cached data.");
      const cached = await readDatasetJSON<MergedPullRequest[]>(
        env.QUEUE_DATA,
        MERGED_HISTORY_DATASET,
      );
      if (!cached) {
        throw new Error("Merged dataset expected but not found in KV storage.");
      }
      mergedPrs = cached;
    }

    const latestMergedAt = computeLatestMergedAt(mergedPrs);
    const nowIso = new Date().toISOString();

    const openVersion = await hashString(JSON.stringify(openPrs));
    const mergedVersion = await hashString(JSON.stringify(mergedPrs));

    let openPointer: DatasetPointer | null = previousOpenPointer;
    if (!openPointer || openPointer.version !== openVersion) {
      const openWriteOptions = {
        updatedAt: nowIso,
        hash: openVersion,
        ...(datasetBaseUrl ? { baseUrl: datasetBaseUrl } : {}),
      } as const;
      openPointer = await writeDatasetJSON(
        env.QUEUE_DATA,
        OPEN_QUEUE_DATASET,
        openVersion,
        openPrs,
        openWriteOptions,
      );
      openDatasetUpdated = true;
      logger.info(
        `[Ingest] Open queue dataset updated (version ${openVersion}).`,
      );
    }

    let mergedPointer: DatasetPointer | null = previousMergedPointer;
    if (!mergedPointer || mergedPointer.version !== mergedVersion) {
      const mergedWriteOptions = {
        updatedAt: nowIso,
        hash: mergedVersion,
        ...(datasetBaseUrl ? { baseUrl: datasetBaseUrl } : {}),
      } as const;
      mergedPointer = await writeDatasetJSON(
        env.QUEUE_DATA,
        MERGED_HISTORY_DATASET,
        mergedVersion,
        mergedPrs,
        mergedWriteOptions,
      );
      mergedDatasetUpdated = true;
      logger.info(
        `[Ingest] Merged history dataset updated (version ${mergedVersion}).`,
      );
    }

    const totals = openPrs.reduce(
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
      plugin: computeWaitEstimate(mergedPrs, "plugin"),
      theme: computeWaitEstimate(mergedPrs, "theme"),
    };

    const weeklyMerged = buildWeeklyMergedSummary(mergedPrs);

    const summary: QueueSummary = {
      checkedAt: nowIso,
      page1ETag: page1ETag,
      latestMergedAt,
      totals,
      waitEstimates,
      weeklyMerged,
      datasets: {
        openQueue: openPointer,
        mergedHistory: mergedPointer,
      },
    };

    await writeQueueSummary(env, summary);
    summaryUpdated = true;

    const completeMessage = "[Ingest] Summary update complete.";
    logger.info(completeMessage);
    return {
      ok: true,
      message: completeMessage,
      logs: logger.entries,
      summaryUpdated,
      openDatasetUpdated,
      mergedDatasetUpdated,
      openDatasetVersion: openPointer.version,
      mergedDatasetVersion: mergedPointer.version,
      checkedAt: summary.checkedAt,
      forced: force,
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
      summaryUpdated,
      openDatasetUpdated,
      mergedDatasetUpdated,
      forced: force,
    };
  }
}
