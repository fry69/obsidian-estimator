import type { MergedPullRequest, PullRequest } from "../types";

type QueueData = {
  openPrs: PullRequest[];
  mergedPrs: MergedPullRequest[];
};

const DATA_URL = "/api/data";

async function requestQueueData(): Promise<QueueData> {
  const response = await fetch(DATA_URL, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Network response was not ok");
  }

  return response.json();
}

export async function fetchQueueData(): Promise<QueueData> {
  return requestQueueData();
}
