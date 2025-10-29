const QUEUE_DETAILS_KEY = "queue-details";
const QUEUE_SUMMARY_KEY = "queue-summary";

export interface QueuePullRequest {
  id: number;
  title: string;
  url: string;
  type: string;
  createdAt: string;
}

export interface QueueMergedPullRequest extends QueuePullRequest {
  mergedAt: string;
  daysToMerge: number;
}

export interface QueueDetails {
  openPrs: QueuePullRequest[];
  mergedPrs: QueueMergedPullRequest[];
}

export interface WaitEstimate {
  estimatedDays: number | null;
  range: {
    lower: number | null;
    upper: number | null;
  };
  isHighVariance: boolean;
}

export interface WeeklyMergedSummary {
  weekStarts: string[];
  pluginCounts: number[];
  themeCounts: number[];
}

export interface QueueSummary {
  checkedAt: string;
  detailsVersion: string;
  detailsUpdatedAt: string;
  page1ETag: string | null;
  latestMergedAt: string | null;
  totals: {
    readyTotal: number;
    readyPlugins: number;
    readyThemes: number;
  };
  waitEstimates: {
    plugin: WaitEstimate;
    theme: WaitEstimate;
  };
  weeklyMerged: WeeklyMergedSummary;
}

export async function readQueueDetails(env: Env): Promise<QueueDetails | null> {
  return env.QUEUE_DATA.get<QueueDetails>(QUEUE_DETAILS_KEY, {
    type: "json",
  });
}

export async function writeQueueDetails(
  env: Env,
  data: QueueDetails,
): Promise<void> {
  await env.QUEUE_DATA.put(QUEUE_DETAILS_KEY, JSON.stringify(data));
}

export async function readQueueSummary(env: Env): Promise<QueueSummary | null> {
  return env.QUEUE_DATA.get<QueueSummary>(QUEUE_SUMMARY_KEY, {
    type: "json",
  });
}

export async function writeQueueSummary(
  env: Env,
  summary: QueueSummary,
): Promise<void> {
  await env.QUEUE_DATA.put(QUEUE_SUMMARY_KEY, JSON.stringify(summary));
}
