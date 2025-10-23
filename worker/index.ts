import { handleScheduled } from "./scheduled";
import { app  } from "./api";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    return app.fetch(request, env, ctx); // Use Hono app.fetch
  },

  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;
