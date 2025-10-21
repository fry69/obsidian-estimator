export interface PullRequest {
  id: number;
  title: string;
  url: string;
  type: 'plugin' | 'theme';
  createdAt: string;
}

export interface MergedPullRequest extends PullRequest {
  mergedAt: string;
  daysToMerge: number;
}
