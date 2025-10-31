import { ingest } from "./ingest";
import { handleRequest } from "./api";
import { pruneDatasetVersions } from "./datasetCache";

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
          await pruneDatasetVersions(env.QUEUE_DATA, "queue-open", 8);
          await pruneDatasetVersions(env.QUEUE_DATA, "queue-merged", 16);
        } catch (error) {
          console.error("[Scheduled] Failed to prune dataset cache:", error);
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
