import { queueSummarySchema, type QueueSummary } from "../shared/queueSchema";

const QUEUE_SUMMARY_KEY = "queue-summary";

export async function readQueueSummary(env: Env): Promise<QueueSummary | null> {
  const raw = await env.QUEUE_DATA.get(QUEUE_SUMMARY_KEY, { type: "json" });
  if (!raw) return null;

  const parsed = queueSummarySchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      "[QueueStore] Stored summary failed validation; discarding snapshot.",
      parsed.error,
    );
    return null;
  }

  return parsed.data;
}

export async function writeQueueSummary(
  env: Env,
  summary: QueueSummary,
): Promise<void> {
  const validated = queueSummarySchema.parse(summary);
  await env.QUEUE_DATA.put(QUEUE_SUMMARY_KEY, JSON.stringify(validated));
}
