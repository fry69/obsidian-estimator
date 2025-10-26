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
  if (typeof window !== "undefined" && window.__PR_DATA_PROMISE__) {
    const promise = window.__PR_DATA_PROMISE__;
    // Don't reuse the same promise after the first consumer resolves it
    delete window.__PR_DATA_PROMISE__;
    const data = await promise;
    if (data) {
      return data;
    }
    // fall through to a fresh request if preloaded promise failed/null
  }

  return requestQueueData();
}
