import type { QueueSummary } from "../types";

const SUMMARY_URL = "/api/summary";

export async function fetchQueueSummary(): Promise<QueueSummary> {
  const response = await fetch(SUMMARY_URL, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch queue summary");
  }

  return response.json();
}
