const QUEUE_DATA_KEY = "queue-data";

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

export interface QueueData {
  openPrs: QueuePullRequest[];
  mergedPrs: QueueMergedPullRequest[];
}

export async function readQueueData(env: Env): Promise<QueueData | null> {
  return env.QUEUE_DATA.get<QueueData>(QUEUE_DATA_KEY, { type: "json" });
}

export async function writeQueueData(env: Env, data: QueueData): Promise<void> {
  await env.QUEUE_DATA.put(QUEUE_DATA_KEY, JSON.stringify(data));
}
