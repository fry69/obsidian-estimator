
import type { MergedPullRequest } from '../types';

const VELOCITY_WEEKS = 12;

// Helper to calculate average and standard deviation
const calculateStats = (prs: MergedPullRequest[]) => {
  if (prs.length === 0) {
    return { mean: NaN, stdDev: NaN };
  }
  const daysToMergeValues = prs.map(pr => pr.daysToMerge);
  const mean = daysToMergeValues.reduce((sum, val) => sum + val, 0) / daysToMergeValues.length;
  const variance = daysToMergeValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / daysToMergeValues.length;
  const stdDev = Math.sqrt(variance);
  return { mean, stdDev };
};

export const calculateWaitTime = (
  history: MergedPullRequest[],
  type: 'plugin' | 'theme'
) => {
  const now = new Date();
  const twelveWeeksAgo = new Date(now.getTime() - VELOCITY_WEEKS * 7 * 24 * 60 * 60 * 1000);

  const recentMerged = history.filter(pr => {
    const mergedDate = new Date(pr.mergedAt);
    return pr.type === type && mergedDate > twelveWeeksAgo;
  });

  const prsPerWeek = recentMerged.length / VELOCITY_WEEKS;

  // Use last 50 merged PRs for moving average
  const last50Merged = recentMerged.slice(-50);
  const stats = calculateStats(last50Merged);

  let estimatedDays: string | number = '∞';
  let waitRange: string = '';

  if (prsPerWeek > 0 && !isNaN(stats.mean)) {
    const baseEstimate = stats.mean;
    const lowerBound = Math.round(baseEstimate - stats.stdDev);
    const upperBound = Math.round(baseEstimate + stats.stdDev);
    estimatedDays = Math.round(baseEstimate);
    waitRange = `(${Math.max(0, lowerBound)}–${upperBound} days)`;
  }

  const confidenceThreshold = 0.5; // If stdDev is more than 50% of the mean, consider it high variance
  const isHighVariance = !isNaN(stats.mean) && stats.mean > 0 && (stats.stdDev / stats.mean) > confidenceThreshold;

  return { estimatedDays, waitRange, isHighVariance };
};


export const generateChartData = (mergedPrs: MergedPullRequest[], filterType: 'all' | 'plugin' | 'theme') => {
    const weeklyData: { [key: string]: { plugins: number; themes: number } } = {};
    const now = new Date();
    const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);

    mergedPrs.forEach(pr => {
        const mergedDate = new Date(pr.mergedAt);
        if (mergedDate < twelveWeeksAgo) return;

        const weekStart = new Date(mergedDate);
        weekStart.setDate(mergedDate.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weeklyData[weekKey]) {
            weeklyData[weekKey] = { plugins: 0, themes: 0 };
        }
        if (pr.type === 'plugin') {
            weeklyData[weekKey].plugins++;
        } else if (pr.type === 'theme') {
            weeklyData[weekKey].themes++;
        }
    });

    const sortedWeeks = Object.keys(weeklyData).sort();
    const labels = sortedWeeks.map(week => new Date(week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const pluginCounts = sortedWeeks.map(week => weeklyData[week].plugins);
    const themeCounts = sortedWeeks.map(week => weeklyData[week].themes);

    const datasets = [];
    if (filterType === 'all' || filterType === 'plugin') {
        datasets.push({
            label: 'Plugins Merged',
            data: pluginCounts,
            backgroundColor: 'rgb(2, 132, 199)', // sky-600
            borderColor: 'rgb(2, 132, 199)',
            borderWidth: 1,
        });
    }
    if (filterType === 'all' || filterType === 'theme') {
        datasets.push({
            label: 'Themes Merged',
            data: themeCounts,
            backgroundColor: 'rgb(219, 39, 119)', // pink-600
            borderColor: 'rgb(219, 39, 119)',
            borderWidth: 1,
        });
    }

    return {
        labels,
        datasets,
    };
};
