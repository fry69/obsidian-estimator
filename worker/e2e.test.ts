import { vi, describe, it, expect, beforeEach } from "vitest";
import worker from "../worker/index"; // Import the worker entrypoint
import { Env } from "../worker/index";

// Mock the Octokit library
vi.mock("@octokit/rest", () => {
  const mockOpenPlugins = [
    {
      number: 101,
      title: "Test Plugin PR",
      html_url: "https://github.com/obsidianmd/obsidian-releases/pull/101",
      created_at: new Date().toISOString(),
      labels: [{ name: "plugin" }, { name: "Ready for review" }],
    },
  ];

  const mockMergedThemes = [
    {
      number: 202,
      title: "Test Theme PR",
      html_url: "https://github.com/obsidianmd/obsidian-releases/pull/202",
      created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
      merged_at: new Date().toISOString(),
      labels: [{ name: "theme" }, { name: "Ready for review" }],
    },
  ];

  const paginate = vi.fn().mockImplementation(async (route, options) => {
    if (options.q.includes('label:plugin')) {
        return mockOpenPlugins;
    }
    if (options.q.includes('label:theme')) {
        return []; // Return empty for open themes for this test case
    }
    if (options.q.includes('is:merged')) {
        return mockMergedThemes;
    }
    return [];
  });

  const Octokit = vi.fn().mockImplementation(() => ({
    paginate,
    // Mock other Octokit methods if needed
  }));

  return { Octokit };
});


describe("scheduled handler integration test", () => {
  let env: Env;

  beforeEach(async () => {
    // Get the environment bindings from the testing environment
    env = getMiniflareBindings<Env>();
    // Ensure tables are clean before each test
    await env.obsidian_queue.exec("DELETE FROM open_prs; DELETE FROM merged_prs;");
  });

  it("should fetch PRs from GitHub and store them in D1", async () => {
    // --- 1. Execute the scheduled event handler ---
    const controller = { scheduledTime: Date.now() };
    // We don't use the real ExecutionContext in this test
    const ctx = {} as ExecutionContext;

    await worker.scheduled(controller, env, ctx);

    // --- 2. Verify the results in the D1 database ---

    // Check for open PRs
    const { results: openPrs } = await env.obsidian_queue
      .prepare("SELECT * FROM open_prs")
      .all();

    expect(openPrs).toHaveLength(1);
    expect(openPrs[0].id).toBe(101);
    expect(openPrs[0].title).toBe("Test Plugin PR");
    expect(openPrs[0].type).toBe("plugin");

    // Check for merged PRs
    const { results: mergedPrs } = await env.obsidian_queue
      .prepare("SELECT * FROM merged_prs")
      .all();

    expect(mergedPrs).toHaveLength(1);
    expect(mergedPrs[0].id).toBe(202);
    expect(mergedPrs[0].title).toBe("Test Theme PR");
    expect(mergedPrs[0].type).toBe("theme");
    expect(mergedPrs[0].daysToMerge).toBe(10);
  });
});
