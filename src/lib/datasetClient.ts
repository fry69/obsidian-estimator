import type { ZodType } from "zod";
import type { DatasetPointerSummary } from "../types";

export async function fetchDataset<T>(
  pointer: DatasetPointerSummary,
  schema: ZodType<T>,
): Promise<T> {
  const { dataset, url } = pointer;

  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch dataset ${dataset} (status ${response.status})`,
    );
  }

  const payload = await response.json();

  return schema.parse(payload);
}
