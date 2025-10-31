import { z } from "zod";

z.config({ jitless: true });

const datasetNamePattern = /^[A-Za-z0-9][A-Za-z0-9-_]{0,62}$/;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/;
const shaPattern = /^[A-Fa-f0-9]{8,128}$/;

const pullRequestSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string(),
  url: z.string().url(),
  type: z.union([z.literal("plugin"), z.literal("theme"), z.string()]),
  createdAt: z.string().datetime({ offset: true }),
});

const mergedPullRequestSchema = pullRequestSchema.extend({
  mergedAt: z.string().datetime({ offset: true }),
  daysToMerge: z.number().nonnegative(),
});

const waitEstimateSchema = z.object({
  estimatedDays: z.number().nonnegative().nullable(),
  range: z.object({
    lower: z.number().nonnegative().nullable(),
    upper: z.number().nonnegative().nullable(),
  }),
  isHighVariance: z.boolean(),
});

const urlStringSchema = z.string().refine(
  (value) => {
    try {
      // Accept absolute URLs or root-relative paths
      // We use a dummy base to validate relative forms.
      new URL(value, "https://example.com");
      return true;
    } catch {
      return false;
    }
  },
  {
    message: "Invalid URL",
  },
);

export const datasetPointerWithoutMetadataSchema = z.object({
  dataset: z.string().regex(datasetNamePattern),
  version: z.string().regex(versionPattern),
  url: urlStringSchema,
  updatedAt: z.string().datetime({ offset: true }),
  size: z.number().int().nonnegative(),
  hash: z.string().regex(shaPattern).optional(),
});

export const datasetPointerSchema = datasetPointerWithoutMetadataSchema.extend({
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const queueSummarySchema = z.object({
  checkedAt: z.string().datetime({ offset: true }),
  page1ETag: z.string().nullable(),
  latestMergedAt: z.string().datetime({ offset: true }).nullable(),
  totals: z.object({
    readyTotal: z.number().int().nonnegative(),
    readyPlugins: z.number().int().nonnegative(),
    readyThemes: z.number().int().nonnegative(),
  }),
  waitEstimates: z.object({
    plugin: waitEstimateSchema,
    theme: waitEstimateSchema,
  }),
  weeklyMerged: z.object({
    weekStarts: z.array(z.string().datetime({ offset: true })),
    pluginCounts: z.array(z.number().int().nonnegative()),
    themeCounts: z.array(z.number().int().nonnegative()),
  }),
  datasets: z.object({
    openQueue: datasetPointerSchema.nullable(),
    mergedHistory: datasetPointerSchema.nullable(),
  }),
});

export const openQueueDatasetSchema = z.array(pullRequestSchema);
export const mergedQueueDatasetSchema = z.array(mergedPullRequestSchema);

export type PullRequest = z.infer<typeof pullRequestSchema>;
export type MergedPullRequest = z.infer<typeof mergedPullRequestSchema>;
export type DatasetPointer = z.infer<typeof datasetPointerSchema>;
export type QueueSummary = z.infer<typeof queueSummarySchema>;
export type WaitEstimate = z.infer<typeof waitEstimateSchema>;
