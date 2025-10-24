import { Hono } from "hono";
import { ingest } from "./ingest";

const app = new Hono(); // Create Hono app instance

app.get("/api/data", async (c) => {
  const env = c.env as Env; // Cast c.env to Env
  try {
    const [openPrs, mergedPrs] = await Promise.all([
      env.obsidian_queue
        .prepare("SELECT * FROM open_prs ORDER BY createdAt ASC")
        .all(),
      env.obsidian_queue
        .prepare("SELECT * FROM merged_prs ORDER BY mergedAt ASC")
        .all(),
    ]);

    return c.json(
      {
        openPrs: openPrs.results,
        mergedPrs: mergedPrs.results,
      },
      {
        headers: {
          "Cache-Control":
            "private, max-age=1800, stale-while-revalidate=30, stale-if-error=86400",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching data from D1:", error);
    return c.json({ error: "Failed to fetch data" }, { status: 500 });
  }
});

app.post("/api/trigger", async (c) => {
  const env = c.env as Env;
  const authHeader = c.req.header("Authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token || !env.TRIGGER_TOKEN || token !== env.TRIGGER_TOKEN) {
    return c.json({ error: "Invalid bearer token" }, { status: 403 });
  }

  try {
    await ingest(env);
    return c.json({ message: "Ingest triggered" }, { status: 202 });
  } catch (error) {
    console.error("Error triggering ingest:", error);
    return c.json({ error: "Failed to trigger ingest" }, { status: 500 });
  }
});

app.all("/*", (c) => {
  // Uncomment below to serve static assets if ASSETS binding is provided
  // const env = c.env as Cloudflare.Env;
  // if (env.ASSETS) {
  //   return env.ASSETS.fetch(c.req.raw);
  // }
  return c.notFound();
});

export { app };
