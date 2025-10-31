import type { MergedPullRequest, WaitEstimate } from "../shared/queueSchema";
import type { QueueSummary } from "../shared/queueSchema";

type WeeklyMergedSummary = QueueSummary["weeklyMerged"];

const VELOCITY_WEEKS = 12;

function calculateStats(prs: MergedPullRequest[]) {
  if (prs.length === 0) {
    return { mean: NaN, stdDev: NaN };
  }

  const values = prs.map((pr) => pr.daysToMerge);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    values.length;
  const stdDev = Math.sqrt(variance);
  return { mean, stdDev };
}

export function computeWaitEstimate(
  history: MergedPullRequest[],
  type: "plugin" | "theme",
): WaitEstimate {
  const now = new Date();
  const twelveWeeksAgo = new Date(
    now.getTime() - VELOCITY_WEEKS * 7 * 24 * 60 * 60 * 1000,
  );

  const recentMerged = history.filter((pr) => {
    const mergedDate = new Date(pr.mergedAt);
    return pr.type === type && mergedDate > twelveWeeksAgo;
  });

  const prsPerWeek = recentMerged.length / VELOCITY_WEEKS;
  const last50Merged = recentMerged.slice(-50);
  const stats = calculateStats(last50Merged);

  let estimatedDays: number | null = null;
  let lowerBound: number | null = null;
  let upperBound: number | null = null;

  if (prsPerWeek > 0 && !Number.isNaN(stats.mean)) {
    const baseEstimate = stats.mean;
    estimatedDays = Math.round(baseEstimate);
    lowerBound = Math.max(0, Math.round(baseEstimate - stats.stdDev));
    upperBound = Math.round(baseEstimate + stats.stdDev);
  }

  const confidenceThreshold = 0.5;
  const isHighVariance =
    !Number.isNaN(stats.mean) &&
    stats.mean > 0 &&
    stats.stdDev / stats.mean > confidenceThreshold;

  return {
    estimatedDays,
    range: {
      lower: lowerBound,
      upper: upperBound,
    },
    isHighVariance,
  };
}

export function buildWeeklyMergedSummary(
  mergedPrs: MergedPullRequest[],
  weeks: number = 12,
): WeeklyMergedSummary {
  const weeklyBuckets: Record<string, { plugins: number; themes: number }> = {};

  const now = new Date();
  const cutoff = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);

  mergedPrs.forEach((pr) => {
    const mergedDate = new Date(pr.mergedAt);
    if (mergedDate < cutoff) {
      return;
    }

    const weekStart = new Date(mergedDate);
    weekStart.setDate(mergedDate.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const key = weekStart.toISOString();

    if (!weeklyBuckets[key]) {
      weeklyBuckets[key] = { plugins: 0, themes: 0 };
    }

    if (pr.type === "plugin") {
      weeklyBuckets[key].plugins += 1;
    } else if (pr.type === "theme") {
      weeklyBuckets[key].themes += 1;
    }
  });

  const weekStarts = Object.keys(weeklyBuckets).sort();
  const pluginCounts = weekStarts.map(
    (week) => weeklyBuckets[week]?.plugins ?? 0,
  );
  const themeCounts = weekStarts.map(
    (week) => weeklyBuckets[week]?.themes ?? 0,
  );

  return {
    weekStarts,
    pluginCounts,
    themeCounts,
  };
}
