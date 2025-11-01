#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { Octokit } from "@octokit/rest";

const OWNER = "obsidianmd";
const REPO = "obsidian-releases";
const QUEUE_LABELS = new Set(["plugin", "theme"]);
const SNAPSHOT_DIR = resolve("vendor/exp");

type QueueLabel = "plugin" | "theme" | "unknown";

type GraphqlLabelNode = {
  name: string;
};

type GraphqlPullRequestNode = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  mergedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: {
    totalCount: number;
  } | null;
  labels: {
    nodes: GraphqlLabelNode[];
  };
  author: {
    login: string;
  } | null;
  mergedBy: {
    login: string;
  } | null;
  mergeCommit: {
    oid: string;
  } | null;
};

type GraphqlSearchResponse = {
  rateLimit: {
    cost: number;
    remaining: number;
    resetAt: string;
  };
  search: {
    issueCount: number;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    nodes: Array<GraphqlPullRequestNode | null>;
  };
};

type IngestedPullRequest = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  mergedAt: string;
  author: string | null;
  mergedBy: string | null;
  labels: string[];
  queueType: QueueLabel;
  commitsTotal: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeCommitSha: string | null;
  isGhost: boolean;
};

type FetchMergedOptions = {
  first: number;
  mergedSince?: string;
  after?: string | null;
  excludeNumbers?: ReadonlySet<number>;
};

type SnapshotWriter = (response: GraphqlSearchResponse) => Promise<void>;

let runTimestamp: string | null = null;
let responseSequence = 0;
let snapshotDirPrepared = false;

function loadGitHubToken(): string {
  const envToken = process.env.GITHUB_TOKEN?.trim();
  if (envToken) return envToken;
  console.error(
    "Missing GitHub token. Set GITHUB_TOKEN or run with `node --env-file=vendor/github.env ...`.",
  );
  process.exit(1);
}

function determineQueueLabel(labels: string[]): QueueLabel {
  for (const label of labels) {
    if (QUEUE_LABELS.has(label)) {
      return label as QueueLabel;
    }
  }
  return "unknown";
}

function toSearchDateFilter(mergedSinceIso: string): string {
  const baseline = new Date(mergedSinceIso);
  if (Number.isNaN(baseline.getTime())) {
    return "";
  }
  // Subtract a day to guard against timezone truncation to dates in the search API.
  baseline.setUTCDate(baseline.getUTCDate() - 1);
  return baseline.toISOString().slice(0, 10);
}

async function fetchMergedPullRequests(
  octokit: Octokit,
  options: FetchMergedOptions,
  onSnapshot?: SnapshotWriter,
): Promise<{
  pulls: IngestedPullRequest[];
  pageInfo: GraphqlSearchResponse["search"]["pageInfo"];
  rateLimit: GraphqlSearchResponse["rateLimit"];
  totalMatched: number;
}> {
  const { first, mergedSince, after, excludeNumbers } = options;

  const qualifiers = [
    `repo:${OWNER}/${REPO}`,
    "is:pr",
    "is:merged",
    "label:plugin,theme",
    "sort:updated-desc",
  ];
  if (mergedSince) {
    const filterDate = toSearchDateFilter(mergedSince);
    if (filterDate) {
      qualifiers.push(`merged:>${filterDate}`);
    }
  }

  const searchExpression = qualifiers.join(" ");

  console.log(`Executing search: ${searchExpression}`);
  const response = await octokit.graphql<GraphqlSearchResponse>(
    `
      query FetchMergedPullRequests(
        $searchQuery: String!
        $first: Int!
        $after: String
      ) {
        rateLimit {
          cost
          remaining
          resetAt
        }
        search(
          query: $searchQuery
          type: ISSUE
          first: $first
          after: $after
        ) {
          issueCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on PullRequest {
              number
              title
              url
              createdAt
              mergedAt
              additions
              deletions
              changedFiles
              commits {
                totalCount
              }
              labels(first: 10) {
                nodes {
                  name
                }
              }
              author {
                login
              }
              mergedBy {
                login
              }
              mergeCommit {
                oid
              }
            }
          }
        }
      }
    `,
    { searchQuery: searchExpression, first, after: after ?? undefined },
  );

  if (onSnapshot) {
    await onSnapshot(response);
  }

  const pulls: IngestedPullRequest[] = [];

  for (const node of response.search.nodes) {
    if (!node) continue;
    if (excludeNumbers?.has(node.number)) continue;
    const labels = node.labels.nodes.map((label) => label.name);
    const queueType = determineQueueLabel(labels);
    if (queueType === "unknown") {
      continue;
    }

    const commitsTotal = node.commits?.totalCount ?? 0;
    const isGhost = commitsTotal === 0 || node.changedFiles === 0;

    pulls.push({
      number: node.number,
      title: node.title,
      url: node.url,
      createdAt: node.createdAt,
      mergedAt: node.mergedAt,
      author: node.author?.login ?? null,
      mergedBy: node.mergedBy?.login ?? null,
      labels,
      queueType,
      commitsTotal,
      additions: node.additions,
      deletions: node.deletions,
      changedFiles: node.changedFiles,
      mergeCommitSha: node.mergeCommit?.oid ?? null,
      isGhost,
    });
  }

  pulls.sort((a, b) => {
    return new Date(a.mergedAt).getTime() - new Date(b.mergedAt).getTime();
  });

  return {
    pulls,
    pageInfo: response.search.pageInfo,
    rateLimit: response.rateLimit,
    totalMatched: response.search.issueCount,
  };
}

function summarisePull(pr: IngestedPullRequest): string {
  const mergedAt = new Date(pr.mergedAt).toISOString();
  const ghostFlag = pr.isGhost ? "ghost" : "normal";
  const stats = `commits=${pr.commitsTotal} files=${pr.changedFiles} Δ+${pr.additions}/-${pr.deletions}`;
  return `#${pr.number} [${pr.queueType}] ${mergedAt} ${ghostFlag} ${stats} ${pr.title}`;
}

function selectLatestMerged(pulls: Iterable<IngestedPullRequest>): Date | null {
  let latest: Date | null = null;
  for (const pr of pulls) {
    const mergedAt = new Date(pr.mergedAt);
    if (!latest || mergedAt.getTime() > latest.getTime()) {
      latest = mergedAt;
    }
  }
  return latest;
}

function formatTimestampForFilename(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

async function ensureSnapshotDir(): Promise<void> {
  if (snapshotDirPrepared) return;
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  snapshotDirPrepared = true;
}

async function writeSnapshot(response: GraphqlSearchResponse): Promise<void> {
  if (!runTimestamp) {
    throw new Error("Run timestamp not initialised before writing snapshot.");
  }
  await ensureSnapshotDir();
  responseSequence += 1;
  const filename = join(
    SNAPSHOT_DIR,
    `response-${runTimestamp}-${responseSequence}.json`,
  );
  const payload = `${JSON.stringify(response, null, 2)}\n`;
  await writeFile(filename, payload, "utf8");
}

async function run(): Promise<void> {
  const token = loadGitHubToken();
  const octokit = new Octokit({
    auth: token,
    userAgent: "obsidian-estimator exploratory graphql script",
  });

  runTimestamp = formatTimestampForFilename(new Date());
  responseSequence = 0;
  snapshotDirPrepared = false;

  console.log("Fetching a sample of recent merged PRs (up to 10)...");
  const initialBatch = await fetchMergedPullRequests(
    octokit,
    { first: 10 },
    writeSnapshot,
  );
  const sample = initialBatch.pulls.slice(-3);

  if (sample.length === 0) {
    console.log("No merged PRs found in the sample window.");
    return;
  }

  console.log(
    `Retrieved ${initialBatch.pulls.length} matched entries (search total ${initialBatch.totalMatched}).`,
  );
  console.log(
    `GraphQL rate limit: cost=${initialBatch.rateLimit.cost} remaining=${initialBatch.rateLimit.remaining} reset=${initialBatch.rateLimit.resetAt}`,
  );
  console.log("\nSampled merged pull requests:");
  for (const pr of sample) {
    console.log(`  - ${summarisePull(pr)}`);
  }

  const latestMergedAt = selectLatestMerged(sample);
  if (!latestMergedAt) {
    console.log("Unable to determine the latest merged timestamp.");
    return;
  }

  console.log(
    `\nChecking for new merges after ${latestMergedAt.toISOString()}...`,
  );

  const seenNumbers = new Set(sample.map((pr) => pr.number));
  const followUp = await fetchMergedPullRequests(
    octokit,
    {
      first: 20,
      mergedSince: latestMergedAt.toISOString(),
      excludeNumbers: seenNumbers,
    },
    writeSnapshot,
  );

  const genuinelyNew = followUp.pulls.filter(
    (pr) => new Date(pr.mergedAt).getTime() > latestMergedAt.getTime(),
  );

  console.log(
    `Follow-up search returned ${followUp.pulls.length} candidate PRs (search total ${followUp.totalMatched})`,
  );
  console.log(
    `GraphQL rate limit: cost=${followUp.rateLimit.cost} remaining=${followUp.rateLimit.remaining} reset=${followUp.rateLimit.resetAt}`,
  );

  if (genuinelyNew.length === 0) {
    console.log("No newer merged PRs detected.");
  } else {
    console.log("Newly merged pull requests:");
    for (const pr of genuinelyNew) {
      console.log(`  - ${summarisePull(pr)}`);
    }
  }
}

run().catch((error) => {
  console.error("Exploration script failed.", error);
  process.exitCode = 1;
});
