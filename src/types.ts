export interface PullRequest {
  id: number;
  title: string;
  url: string;
  type: "plugin" | "theme";
  createdAt: string;
}

export interface MergedPullRequest extends PullRequest {
  mergedAt: string;
  daysToMerge: number;
}

export interface WaitEstimateSummary {
  estimatedDays: number | null;
  range: {
    lower: number | null;
    upper: number | null;
  };
  isHighVariance: boolean;
}

export interface QueueSummary {
  checkedAt: string;
  detailsVersion: string;
  detailsUpdatedAt: string;
  page1ETag: string | null;
  latestMergedAt: string | null;
  totals: {
    readyTotal: number;
    readyPlugins: number;
    readyThemes: number;
  };
  waitEstimates: {
    plugin: WaitEstimateSummary;
    theme: WaitEstimateSummary;
  };
  weeklyMerged: {
    weekStarts: string[];
    pluginCounts: number[];
    themeCounts: number[];
  };
}

export interface QueueDetailsResponse {
  version: string | null;
  updatedAt: string | null;
  openPrs: PullRequest[];
  mergedPrs: MergedPullRequest[];
}

const submissionFilters = ["all", "plugin", "theme"] as const;

export type SubmissionFilter = (typeof submissionFilters)[number];

export const isSubmissionFilter = (
  value: string,
): value is SubmissionFilter => {
  return submissionFilters.includes(value as SubmissionFilter);
};
