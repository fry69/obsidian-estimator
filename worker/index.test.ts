/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import worker from './index';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Mock the D1 database
const mockD1 = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  run: vi.fn().mockResolvedValue({}),
  all: vi.fn().mockResolvedValue({ results: [] }),
};

const mockEnv = {
  obsidian_queue: mockD1 as any,
  GITHUB_TOKEN: 'test-token',
  ASSETS: { fetch: vi.fn() } as any,
};

const mockOpenPlugins = {
  total_count: 1,
  incomplete_results: false,
  items: [
    {
      number: 101,
      title: 'feat: New Plugin',
      html_url: 'https://github.com/obsidianmd/obsidian-releases/pull/101',
      created_at: '2023-10-01T10:00:00Z',
      labels: [{ name: 'plugin' }, { name: 'Ready for review' }],
    },
  ],
};

const mockOpenThemes = {
  total_count: 1,
  incomplete_results: false,
  items: [
    {
      number: 102,
      title: 'style: New Theme',
      html_url: 'https://github.com/obsidianmd/obsidian-releases/pull/102',
      created_at: '2023-10-02T10:00:00Z',
      labels: [{ name: 'theme' }, { name: 'Ready for review' }],
    },
  ],
};

const twelveMonthsAgo = new Date();
twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
const mergedQueryDate = twelveMonthsAgo.toISOString().split('T')[0];

const mockMergedPrs = {
    total_count: 1,
    incomplete_results: false,
    items: [
        {
            number: 201,
            title: 'fix: Old Plugin',
            html_url: 'https://github.com/obsidianmd/obsidian-releases/pull/201',
            created_at: '2023-09-01T12:00:00Z',
            merged_at: '2023-09-10T12:00:00Z',
            labels: [{ name: 'plugin' }, { name: 'Ready for review' }],
        }
    ]
}

const handlers = [
    http.get('https://api.github.com/search/issues', ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get('q');
        if (q === 'is:pr repo:obsidianmd/obsidian-releases state:open label:"Ready for review" label:plugin') {
            return HttpResponse.json(mockOpenPlugins)
        }
        if (q === 'is:pr repo:obsidianmd/obsidian-releases state:open label:"Ready for review" label:theme') {
            return HttpResponse.json(mockOpenThemes)
        }
        if (q === `is:pr repo:obsidianmd/obsidian-releases is:merged label:"Ready for review" merged:>${mergedQueryDate}`) {
            return HttpResponse.json(mockMergedPrs)
        }
    })
];

const server = setupServer(...handlers);

describe('Obsidian PR Queue Worker', () => {
    beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
    afterAll(() => server.close());
    afterEach(() => {
        server.resetHandlers();
        vi.clearAllMocks();
    });

  describe('scheduled function', () => {
    it('should fetch open and merged PRs and update the D1 database', async () => {
      // Execute the scheduled function
      await worker.scheduled({ scheduledTime: Date.now(), cron: '0 * * * *' } as any, mockEnv, {} as any);

      // Verify D1 open_prs table was cleared and updated
      expect(mockD1.prepare).toHaveBeenCalledWith('DELETE FROM open_prs');
      expect(mockD1.prepare).toHaveBeenCalledWith(
        'INSERT INTO open_prs (id, title, url, type, createdAt) VALUES (?, ?, ?, ?, ?)'
      );

      // Check plugin insertion
      expect(mockD1.bind).toHaveBeenCalledWith(
        101,
        'feat: New Plugin',
        'https://github.com/obsidianmd/obsidian-releases/pull/101',
        'plugin',
        '2023-10-01T10:00:00Z'
      );
      // Check theme insertion
      expect(mockD1.bind).toHaveBeenCalledWith(
        102,
        'style: New Theme',
        'https://github.com/obsidianmd/obsidian-releases/pull/102',
        'theme',
        '2023-10-02T10:00:00Z'
      );

      // Verify D1 merged_prs table was cleared and updated
      expect(mockD1.prepare).toHaveBeenCalledWith('DELETE FROM merged_prs');
      expect(mockD1.prepare).toHaveBeenCalledWith(
        'INSERT INTO merged_prs (id, title, url, type, createdAt, mergedAt, daysToMerge) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );

      // Check merged PR insertion
      const createdAt = new Date('2023-09-01T12:00:00Z');
      const mergedAt = new Date('2023-09-10T12:00:00Z');
      const daysToMerge = Math.round((mergedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      expect(mockD1.bind).toHaveBeenCalledWith(
        201,
        'fix: Old Plugin',
        'https://github.com/obsidianmd/obsidian-releases/pull/201',
        'plugin',
        '2023-09-01T12:00:00Z',
        '2023-09-10T12:00:00Z',
        daysToMerge
      );

      // Verify run was called for each prepare
      expect(mockD1.run).toHaveBeenCalledTimes(5); // 2 deletes + 3 inserts
    });
  });
});