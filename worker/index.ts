import { ingest } from "./ingest";
import { handleRequest } from "./api";

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
    _ctx: ExecutionContext,
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
  },
} satisfies ExportedHandler<Env>;
