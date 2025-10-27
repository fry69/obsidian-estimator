import type { QueueDetailsResponse } from "../types";

const DETAILS_URL = "/api/details";

export async function fetchQueueDetails(
  version?: string,
): Promise<QueueDetailsResponse> {
  const url = version ? `${DETAILS_URL}?version=${encodeURIComponent(version)}` : DETAILS_URL;

  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch queue details");
  }

  return response.json();
}
