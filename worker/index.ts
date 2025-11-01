import { ingest } from "./ingest.ts";
import { handleRequest } from "./api.ts";
import { pruneDatasetVersions } from "./datasetCache.ts";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    return handleRequest(request, env);
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.debug(
      `[Scheduled] Cron trigger fired at ${controller.scheduledTime}`,
    );

    const result = await ingest(env);
    if (!result.ok) {
      console.error(
        `[Scheduled] Ingest failed at ${controller.scheduledTime}`,
        result.error ?? result.message,
      );
    }

    ctx.waitUntil(
      (async () => {
        try {
          await sleep(70_000);
          await pruneDatasetVersions(env.QUEUE_DATA, "queue-open");
          await pruneDatasetVersions(env.QUEUE_DATA, "queue-merged");
        } catch (error) {
          console.error("[Scheduled] Failed to prune dataset cache:", error);
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
