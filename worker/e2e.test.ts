import { vi, describe, it, expect, beforeEach, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import worker from "./index"; // Import the worker entrypoint
import type { Env } from "./index";

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

  const paginate = vi.fn().mockImplementation(async (_route, options) => {
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

  const mockRequest = vi.fn().mockResolvedValue({ data: { items: [] } });

  const Octokit = vi.fn().mockImplementation(() => ({
    paginate,
    request: mockRequest
  }));

  return { Octokit };
});

const D1_SCHEMA = `
DROP TABLE IF EXISTS open_prs;
CREATE TABLE open_prs (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL,
    createdAt TEXT NOT NULL
);

DROP TABLE IF EXISTS merged_prs;
CREATE TABLE merged_prs (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    mergedAt TEXT,
    daysToMerge INTEGER
);
`;

describe("scheduled handler integration test", () => {

  beforeAll(async () => {
    const testEnv = env as Env;
    // Apply the D1 schema before all tests by executing statements individually
    const statements = D1_SCHEMA.split(';').map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await testEnv.obsidian_queue.exec(stmt);
    }
  });

  beforeEach(async () => {
    const testEnv = env as Env;
    // Ensure tables are clean before each test
    await testEnv.obsidian_queue.exec("DELETE FROM open_prs; DELETE FROM merged_prs;");
  });

  it("should fetch PRs from GitHub and store them in D1", async () => {
    // --- 1. Execute the scheduled event handler ---
    const controller: ScheduledController = {
      scheduledTime: Date.now(),
      cron: "* * * * *", // Dummy value for cron
      noRetry: () => {},    // Dummy function for noRetry
    };
    // We don't use the real ExecutionContext in this test
    const ctx = {} as ExecutionContext;
    const testEnv = env as Env;

    await worker.scheduled(controller, testEnv, ctx);

    // --- 2. Verify the results in the D1 database ---

    // Check for open PRs
    const { results: openPrs } = await testEnv.obsidian_queue
      .prepare("SELECT * FROM open_prs")
      .all();

    expect(openPrs).toHaveLength(1);
    expect(openPrs[0].id).toBe(101);
    expect(openPrs[0].title).toBe("Test Plugin PR");
    expect(openPrs[0].type).toBe("plugin");

    // Check for merged PRs
    const { results: mergedPrs } = await testEnv.obsidian_queue
      .prepare("SELECT * FROM merged_prs")
      .all();

    expect(mergedPrs).toHaveLength(1);
    expect(mergedPrs[0].id).toBe(202);
    expect(mergedPrs[0].title).toBe("Test Theme PR");
    expect(mergedPrs[0].type).toBe("theme");
    expect(mergedPrs[0].daysToMerge).toBe(10);
  });
});
