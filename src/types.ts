export {
  queueSummarySchema,
  openQueueDatasetSchema,
  mergedQueueDatasetSchema,
} from "../shared/queueSchema.ts";

export type {
  PullRequest,
  MergedPullRequest,
  WaitEstimate,
  DatasetPointer as DatasetPointerSummary,
  QueueSummary,
} from "../shared/queueSchema.ts";

const submissionFilters = ["all", "plugin", "theme"] as const;

export type SubmissionFilter = (typeof submissionFilters)[number];

export const isSubmissionFilter = (
  value: string,
): value is SubmissionFilter => {
  return submissionFilters.includes(value as SubmissionFilter);
};
