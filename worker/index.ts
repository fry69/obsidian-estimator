import { Octokit } from "@octokit/rest";
import { Router } from "itty-router";

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
  merged_at?: string | null; // optional and can be null
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
    await db.prepare("DELETE FROM merged_prs").run();
    const prsToInsert = prs.filter((pr) => pr.merged_at);
    if (prsToInsert.length === 0) {
      console.log("No merged PRs to update.");
      return;
    }

    const stmt = db.prepare(
      "INSERT INTO merged_prs (id, title, url, type, createdAt, mergedAt, daysToMerge) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );

    const batch = prsToInsert.map((pr) => {
      const typeLabel = pr.labels.find(
        (label) => label.name === "plugin" || label.name === "theme"
      );
      const type = typeLabel ? typeLabel.name : "unknown";
      const createdAt = new Date(pr.created_at);
      const mergedAt = new Date(pr.merged_at!); // Non-null assertion is safe due to filter
      const daysToMerge = Math.round(
        (mergedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      return stmt.bind(
        pr.number,
        pr.title,
        pr.html_url,
        type,
        pr.created_at,
        pr.merged_at,
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

const router = Router();

router.get("/api/queue", async (_request, env: Env) => {
  try {
    const { results } = await env.obsidian_queue
      .prepare("SELECT * FROM open_prs ORDER BY createdAt ASC")
      .all();
    return Response.json(results);
  } catch (error) {
    console.error("Error fetching open PRs from D1:", error);
    return Response.json(
      { error: "Failed to fetch open PRs" },
      { status: 500 }
    );
  }
});

router.get("/api/history", async (_request, env: Env) => {
  try {
    const { results } = await env.obsidian_queue.prepare("SELECT * FROM merged_prs ORDER BY mergedAt ASC").all();
    return Response.json(results);
  } catch (error) {
    console.error("Error fetching merged PRs from D1:", error);
    return Response.json({ error: "Failed to fetch merged PRs" }, { status: 500 });
  }
});

// Temporary endpoint to manually trigger the scheduled function for debugging/initial population
router.get("/admin/trigger-scheduled", async (request, env: Env, ctx: ExecutionContext) => {
  const secret = request.url.split('secret=')[1];
  if (secret !== "YOUR_DEBUG_SECRET") { // Replace with a strong secret for actual use
    return new Response("Unauthorized", { status: 401 });
  }
  console.log("Manually triggering scheduled event...");
  await worker.scheduled({ scheduledTime: Date.now() }, env, ctx);
  return new Response("Scheduled event triggered successfully!");
});

router.all("/*", (request, env: Env) => env.ASSETS.fetch(request));

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    return router.handle(request, env, ctx);
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    console.log(`Cron trigger fired at ${controller.scheduledTime}`);

    const octokit = new Octokit({
      auth: env.GITHUB_TOKEN,
    });

    const owner = "obsidianmd";
    const repo = "obsidian-releases";

    // --- 1. Fetch Data from GitHub ---
    const openPluginsQuery = `is:pr repo:${owner}/${repo} state:open label:"Ready for review" label:plugin`;
    const openThemesQuery = `is:pr repo:${owner}/${repo} state:open label:"Ready for review" label:theme`;

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    const mergedQueryDate = twelveMonthsAgo.toISOString().split("T")[0];
    const mergedQuery = `is:pr repo:${owner}/${repo} is:merged label:"Ready for review" merged:>${mergedQueryDate}`;

    try {
      const [openPlugins, openThemes, mergedPrs] = await Promise.all([
        searchGitHubIssues(octokit, openPluginsQuery),
        searchGitHubIssues(octokit, openThemesQuery),
        searchGitHubIssues(octokit, mergedQuery),
      ]);

      const allOpenPrs = [...openPlugins, ...openThemes];

      // --- 2. Update Database ---
      await Promise.all([
        updateOpenPrsInDb(env.obsidian_queue, allOpenPrs),
        updateMergedPrsInDb(env.obsidian_queue, mergedPrs),
      ]);

      console.log("Successfully updated all database tables.");
    } catch (error) {
      console.error(
        "Failed to fetch data from GitHub or update database:",
        error
      );
    }
  },
} satisfies ExportedHandler<Env>;
