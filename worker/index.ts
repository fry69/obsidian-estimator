import { Octokit } from "@octokit/rest";
import { Router } from "itty-router";

export interface Env {
  obsidian_queue: D1Database;
  GITHUB_TOKEN: string;
  ASSETS: Fetcher;
}

const router = Router();

router.get("/api/queue", async (_request, env: Env) => {
  try {
    const { results } = await env.obsidian_queue.prepare("SELECT * FROM open_prs ORDER BY createdAt ASC").all();
    return Response.json(results);
  } catch (error) {
    console.error("Error fetching open PRs from D1:", error);
    return Response.json({ error: "Failed to fetch open PRs" }, { status: 500 });
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

router.all("/*", (request, env: Env) => env.ASSETS.fetch(request));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return router.handle(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log(`Cron trigger fired at ${controller.scheduledTime}`);

    const octokit = new Octokit({
      auth: env.GITHUB_TOKEN,
    });

    const owner = "obsidianmd";
    const repo = "obsidian-releases";
    const per_page = 100; // Max per page

    // Fetch open plugins
    let allOpenPlugins: any[] = [];
    let page = 1;
    while (true) {
      const response = await octokit.search.issuesAndPullRequests({
        q: `is:pr repo:${owner}/${repo} state:open label:"Ready for review" label:plugin`,
        per_page,
        page,
      });
      allOpenPlugins = allOpenPlugins.concat(response.data.items);
      if (response.data.items.length < per_page) {
        break;
      }
      page++;
    }

    // Fetch open themes
    let allOpenThemes: any[] = [];
    page = 1;
    while (true) {
      const response = await octokit.search.issuesAndPullRequests({
        q: `is:pr repo:${owner}/${repo} state:open label:"Ready for review" label:theme`,
        per_page,
        page,
      });
      allOpenThemes = allOpenThemes.concat(response.data.items);
      if (response.data.items.length < per_page) {
        break;
      }
      page++;
    }

    const allOpenPrs = [...allOpenPlugins, ...allOpenThemes];

    // Clear existing open_prs and insert new ones
    try {
      await env.obsidian_queue.prepare("DELETE FROM open_prs").run();
      for (const pr of allOpenPrs) {
        const typeLabel = pr.labels.find((label: any) => label.name === 'plugin' || label.name === 'theme');
        const type = typeLabel ? typeLabel.name : 'unknown';
        await env.obsidian_queue
          .prepare(
            "INSERT INTO open_prs (id, title, url, type, createdAt) VALUES (?, ?, ?, ?, ?)"
          )
          .bind(pr.number, pr.title, pr.html_url, type, pr.created_at)
          .run();
      }
      console.log(`Successfully updated open_prs table with ${allOpenPrs.length} PRs.`);
    } catch (error) {
      console.error("Error updating open_prs table:", error);
    }

    // Fetch merged plugins and themes for the last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    const mergedQueryDate = twelveMonthsAgo.toISOString().split('T')[0];

    let allMergedPrs: any[] = [];
    page = 1;
    while (true) {
      const response = await octokit.search.issuesAndPullRequests({
        q: `is:pr repo:${owner}/${repo} is:merged label:"Ready for review" merged:>${mergedQueryDate}`,
        per_page,
        page,
      });
      allMergedPrs = allMergedPrs.concat(response.data.items);
      if (response.data.items.length < per_page) {
        break;
      }
      page++;
    }

    // Clear existing merged_prs and insert new ones
    try {
      await env.obsidian_queue.prepare("DELETE FROM merged_prs").run();
      for (const pr of allMergedPrs) {
        const typeLabel = pr.labels.find((label: any) => label.name === 'plugin' || label.name === 'theme');
        const type = typeLabel ? typeLabel.name : 'unknown';
        const createdAt = new Date(pr.created_at);
        const mergedAt = new Date(pr.merged_at);
        const daysToMerge = Math.round((mergedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

        await env.obsidian_queue
          .prepare(
            "INSERT INTO merged_prs (id, title, url, type, createdAt, mergedAt, daysToMerge) VALUES (?, ?, ?, ?, ?, ?, ?)"
          )
          .bind(pr.number, pr.title, pr.html_url, type, pr.created_at, pr.merged_at, daysToMerge)
          .run();
      }
      console.log(`Successfully updated merged_prs table with ${allMergedPrs.length} PRs.`);
    } catch (error) {
      console.error("Error updating merged_prs table:", error);
    }
  },
} satisfies ExportedHandler<Env>;

