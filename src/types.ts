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

export interface WeeklyMergedSummary {
  weekStarts: string[];
  pluginCounts: number[];
  themeCounts: number[];
}

export interface QueueSummary {
  checkedAt: string;
  detailsVersion: string;
  detailsUpdatedAt: string;
  totals: {
    readyTotal: number;
    readyPlugins: number;
    readyThemes: number;
  };
  waitEstimates: {
    plugin: WaitEstimateSummary;
    theme: WaitEstimateSummary;
  };
  weeklyMerged: WeeklyMergedSummary;
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
