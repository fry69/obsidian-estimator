
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';
import { mockFetch, clearMocks } from 'vi-fetch';

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


describe('Obsidian PR Queue Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMocks();
    mockFetch.clearAll();
  });

  describe('scheduled function', () => {
    it('should fetch open and merged PRs and update the D1 database', async () => {
      // Mock GitHub API responses
      mockFetch.when('https://api.github.com/search/issues?q=is%3Apr%20repo%3Aobsidianmd%2Fobsidian-releases%20state%3Aopen%20label%3A%22Ready%20for%20review%22%20label%3Aplugin&per_page=100&page=1').respondWith(JSON.stringify(mockOpenPlugins));
      mockFetch.when('https://api.github.com/search/issues?q=is%3Apr%20repo%3Aobsidianmd%2Fobsidian-releases%20state%3Aopen%20label%3A%22Ready%20for%20review%22%20label%3Atheme&per_page=100&page=1').respondWith(JSON.stringify(mockOpenThemes));
      mockFetch.when(`https://api.github.com/search/issues?q=is%3Apr%20repo%3Aobsidianmd%2Fobsidian-releases%20is%3Amerged%20label%3A%22Ready%20for%20review%22%20merged%3A%3E${mergedQueryDate}&per_page=100&page=1`).respondWith(JSON.stringify(mockMergedPrs));


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
      expect(mockD1.run).toHaveBeenCalledTimes(6); // 2 deletes + 4 inserts
    });
  });
});
