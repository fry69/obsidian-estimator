import { Hono } from "hono";

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

    return c.json({
      openPrs: openPrs.results,
      mergedPrs: mergedPrs.results,
    });
  } catch (error) {
    console.error("Error fetching data from D1:", error);
    return c.json({ error: "Failed to fetch data" }, { status: 500 });
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