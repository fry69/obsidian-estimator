import { Octokit } from "@octokit/rest";
import { Hono } from "hono"; // Import Hono
import { Env } from "./index"; // Import Env from the same file

export interface Env {
  obsidian_queue: D1Database;
  GITHUB_TOKEN: string;
  ASSETS: Fetcher;
}

// This interface is a subset of the GitHub API response for search results
// and is what we'll use for type safety in our application.
interface GitHubPr {
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  pull_request?: {
    merged_at?: string | null;
  };
  labels: {
    name: string;
  }[];
  user: {
    login: string;
  } | null;
}

/**
 * Fetches paginated results from the GitHub search API.
 * @param octokit - An authenticated Octokit instance.
 * @param q - The search query string.
 * @returns A promise that resolves to an array of PR/issue data.
 */
async function searchGitHubIssues(
  octokit: Octokit,
  q: string
): Promise<GitHubPr[]> {
  const results = await octokit.paginate("GET /search/issues", {
    q,
    per_page: 100,
  });
  return results as GitHubPr[];
}

/**
 * Updates the open_prs table in the D1 database.
 * It first clears the table and then inserts the new set of open PRs.
 * @param db - The D1 database instance.
 * @param prs - An array of open PRs to insert.
 */
async function updateOpenPrsInDb(
  db: D1Database,
  prs: GitHubPr[]
): Promise<void> {
  try {
    await db.prepare("DELETE FROM open_prs").run();
    if (prs.length === 0) {
      console.log("No open PRs to update.");
      return;
    }

    const stmt = db.prepare(
      "INSERT INTO open_prs (id, title, url, type, createdAt) VALUES (?, ?, ?, ?, ?)"
    );

    const batch = prs.map((pr) => {
      const typeLabel = pr.labels.find(
        (label) => label.name === "plugin" || label.name === "theme"
      );
      const type = typeLabel ? typeLabel.name : "unknown";
      return stmt.bind(pr.number, pr.title, pr.html_url, type, pr.created_at);
    });

    await db.batch(batch);
    console.log(`Successfully updated open_prs table with ${prs.length} PRs.`);
  } catch (error) {
    console.error("Error updating open_prs table:", error);
  }
}

/**
 * Updates the merged_prs table in the D1 database.
 * It first clears the table and then inserts the new set of merged PRs.
 * @param db - The D1 database instance.
 * @param prs - An array of merged PRs to insert.
 */
async function updateMergedPrsInDb(
  db: D1Database,
  prs: GitHubPr[]
): Promise<void> {
  try {
    console.log(`[updateMergedPrsInDb] Received ${prs.length} PRs to process.`);
    if (prs.length > 0) {
      console.log("[updateMergedPrsInDb] First PR received:", JSON.stringify(prs[0], null, 2));
    }
    await db.prepare("DELETE FROM merged_prs").run();
    const prsToInsert = prs.filter((pr) => pr.pull_request && pr.pull_request.merged_at);
    console.log(`[updateMergedPrsInDb] Found ${prsToInsert.length} PRs with a merged_at date.`);

    if (prsToInsert.length === 0) {
      console.log("No merged PRs to update.");
      return;
    }

    console.log("[updateMergedPrsInDb] First PR to insert:", JSON.stringify(prsToInsert[0], null, 2));

    const stmt = db.prepare(
      "INSERT INTO merged_prs (id, title, url, type, createdAt, mergedAt, daysToMerge) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );

    const batch = prsToInsert.map((pr) => {
      const typeLabel = pr.labels.find(
        (label) => label.name === "plugin" || label.name === "theme"
      );
      const type = typeLabel ? typeLabel.name : "unknown";
      const createdAt = new Date(pr.created_at);
      const mergedAt = new Date(pr.pull_request!.merged_at!); // Non-null assertion is safe due to filter
      const daysToMerge = Math.round(
        (mergedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      return stmt.bind(
        pr.number,
        pr.title,
        pr.html_url,
        type,
        pr.created_at,
        pr.pull_request!.merged_at!,
        daysToMerge
      );
    });

    await db.batch(batch);
    console.log(
      `Successfully updated merged_prs table with ${prsToInsert.length} PRs.`
    );
  } catch (error) {
    console.error("Error updating merged_prs table:", error);
  }
}

const app = new Hono(); // Create Hono app instance

app.get("/api/queue", async (c) => {
  const env = c.env as Env; // Cast c.env to Env
  try {
    const { results } = await env.obsidian_queue
      .prepare("SELECT * FROM open_prs ORDER BY createdAt ASC")
      .all();
    return c.json(results);
  } catch (error) {
    console.error("Error fetching open PRs from D1:", error);
    return c.json(
      { error: "Failed to fetch open PRs" },
      { status: 500 }
    );
  }
});

app.get("/api/history", async (c) => {
  const env = c.env as Env; // Cast c.env to Env
  try {
    const { results } = await env.obsidian_queue.prepare("SELECT * FROM merged_prs ORDER BY mergedAt ASC").all();
    return c.json(results);
  } catch (error) {
    console.error("Error fetching merged PRs from D1:", error);
    return c.json({ error: "Failed to fetch merged PRs" }, { status: 500 });
  }
});

// Temporary endpoint to manually trigger the scheduled function for debugging/initial population
app.get("/admin/trigger-scheduled", async (c) => {
  const env = c.env as Env; // Cast c.env to Env
  const ctx = c.executionCtx; // Get execution context from Hono context
  const secret = c.req.query('secret'); // Get query param from Hono request

  if (secret !== "YOUR_DEBUG_SECRET") { // Replace with a strong secret for actual use
    return c.text("Unauthorized", 401);
  }
  console.log("Manually triggering scheduled event...");
  await handleScheduled({
    scheduledTime: Date.now(),
    cron: "* * * * *", // Dummy value for cron
    noRetry: () => {},    // Dummy function for noRetry
  }, env, ctx);
  return c.text("Scheduled event triggered successfully!");
});

app.all("/*", async (c) => {
  const env = c.env as Env; // Cast c.env to Env
  return env.ASSETS.fetch(c.req.raw); // Serve static assets
});

async function handleScheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
  console.log(`[Scheduled] Cron trigger fired at ${controller.scheduledTime}`);

  const octokit = new Octokit({
    auth: env.GITHUB_TOKEN,
  });

  const owner = "obsidianmd";
  const repo = "obsidian-releases";

  console.log("[Scheduled] Fetching open plugins...");
  const openPluginsQuery = `is:pr repo:${owner}/${repo} state:open label:"Ready for review" label:plugin`;
  const openThemesQuery = `is:pr repo:${owner}/${repo} state:open label:"Ready for review" label:theme`;

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const mergedQueryDate = twelveMonthsAgo.toISOString().split('T')[0];
  const mergedQuery = `is:pr repo:${owner}/${repo} is:merged merged:>${mergedQueryDate}`;

  try {
    console.log("[Scheduled] Calling GitHub API for PRs...");
    const [openPlugins, openThemes, mergedPrs] = await Promise.all([
      searchGitHubIssues(octokit, openPluginsQuery),
      searchGitHubIssues(octokit, openThemesQuery),
      searchGitHubIssues(octokit, mergedQuery),
    ]);
    console.log(`[Scheduled] Fetched ${openPlugins.length} open plugins, ${openThemes.length} open themes, ${mergedPrs.length} merged PRs.`);

    const allOpenPrs = [...openPlugins, ...openThemes];

    console.log("[Scheduled] Updating database...");
    await Promise.all([
      updateOpenPrsInDb(env.obsidian_queue, allOpenPrs),
      updateMergedPrsInDb(env.obsidian_queue, mergedPrs),
    ]);

    console.log("[Scheduled] Successfully updated all database tables.");

  } catch (error) {
    console.error("[Scheduled] Failed to fetch data from GitHub or update database:", error);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx); // Use Hono app.fetch
  },

  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;