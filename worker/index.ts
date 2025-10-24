import { ingest } from "./ingest";
import { app } from "./api";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    return app.fetch(request, env, ctx); // Use Hono app.fetch
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    console.debug(
      `[Scheduled] Cron trigger fired at ${controller.scheduledTime}`
    );

    return await ingest(env);
  },
} satisfies ExportedHandler<Env>;
