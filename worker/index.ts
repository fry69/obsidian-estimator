import { Octokit } from "@octokit/rest";
import { Hono } from "hono"; // Import Hono


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
    const prsToInsert = prs.filter((pr) => pr.pull_request && pr.pull_request.merged_at);


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
  } catch (error) {
    console.error("Error updating merged_prs table:", error);
  }
}

const app = new Hono(); // Create Hono app instance

app.get('/api/data', async (c) => {
	const env = c.env as Env; // Cast c.env to Env
	try {
		const [openPrs, mergedPrs] = await Promise.all([
			env.obsidian_queue.prepare('SELECT * FROM open_prs ORDER BY createdAt ASC').all(),
			env.obsidian_queue.prepare('SELECT * FROM merged_prs ORDER BY mergedAt ASC').all(),
		]);

		return c.json({
			openPrs: openPrs.results,
			mergedPrs: mergedPrs.results,
		});
	} catch (error) {
		console.error('Error fetching data from D1:', error);
		return c.json({ error: 'Failed to fetch data' }, { status: 500 });
	}
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

  console.log("[Scheduled] Fetching open plugins and themes...");
  const openPluginsQuery = `is:pr repo:${owner}/${repo} state:open label:"Ready for review" label:plugin`;
  const openThemesQuery = `is:pr repo:${owner}/${repo} state:open label:"Ready for review" label:theme`;

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const mergedQueryDate = twelveMonthsAgo.toISOString().split('T')[0];
  const mergedQuery = `is:pr repo:${owner}/${repo} is:merged merged:>${mergedQueryDate}`;

  try {
    const [openPlugins, openThemes, mergedPrs] = await Promise.all([
      searchGitHubIssues(octokit, openPluginsQuery),
      searchGitHubIssues(octokit, openThemesQuery),
      searchGitHubIssues(octokit, mergedQuery),
    ]);
    const allOpenPrs = [...openPlugins, ...openThemes];

    await Promise.all([
      updateOpenPrsInDb(env.obsidian_queue, allOpenPrs),
      updateMergedPrsInDb(env.obsidian_queue, mergedPrs),
    ]);

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