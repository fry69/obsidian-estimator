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

const submissionFilters = ["all", "plugin", "theme"] as const;

export type SubmissionFilter = (typeof submissionFilters)[number];

export const isSubmissionFilter = (
  value: string
): value is SubmissionFilter => {
  return submissionFilters.includes(value as SubmissionFilter);
};
