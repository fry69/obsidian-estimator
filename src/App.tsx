import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import './App.css';
import type { MergedPullRequest, PullRequest } from './types';
import { calculateWaitTime, generateChartData } from './lib/calculations';
import KpiCard from './components/KpiCard';
import TimelineChart from './components/TimelineChart';
import QueueTable from './components/QueueTable';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function App() {
  const [chartFilter, setChartFilter] = useState<'all' | 'plugin' | 'theme'>('all');

  const { data: openPrs, isLoading: isLoadingOpenPrs, error: openPrsError } = useQuery<PullRequest[]>({
    queryKey: ['openPrs'],
    queryFn: async () => {
      const response = await fetch('/api/queue');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
  });

  const { data: mergedPrs, isLoading: isLoadingMergedPrs, error: mergedPrsError } = useQuery<MergedPullRequest[]>({
    queryKey: ['mergedPrs'],
    queryFn: async () => {
      const response = await fetch('/api/history');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
  });

  const readyForReviewPrs = openPrs || [];
  const readyPlugins = readyForReviewPrs.filter(pr => pr.type === 'plugin');
  const readyThemes = readyForReviewPrs.filter(pr => pr.type === 'theme');

  const { estimatedDays: estimatedPluginWaitDays, waitRange: pluginWaitRange } = useMemo(() => {
    return calculateWaitTime(readyForReviewPrs, mergedPrs || [], 'plugin');
  }, [readyForReviewPrs, mergedPrs]);

  const { estimatedDays: estimatedThemeWaitDays, waitRange: themeWaitRange } = useMemo(() => {
    return calculateWaitTime(readyForReviewPrs, mergedPrs || [], 'theme');
  }, [readyForReviewPrs, mergedPrs]);

  const chartData = useMemo(() => {
    return generateChartData(mergedPrs || [], chartFilter);
  }, [mergedPrs, chartFilter]);


  if (isLoadingOpenPrs || isLoadingMergedPrs) return <div className="text-center p-8 text-slate-500">Loading data...</div>;
  if (openPrsError) return <div className="text-center p-8 text-red-500">Error fetching open PRs: {openPrsError.message}</div>;
  if (mergedPrsError) return <div className="text-center p-8 text-red-500">Error fetching merged PRs: {mergedPrsError.message}</div>;

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="text-center mb-10">
        <h1 className="text-4xl font-bold text-slate-900">Obsidian Release PR Queue</h1>
        <p className="mt-2 text-lg text-slate-600">Dashboard for community plugin & theme submissions.</p>
      </header>

      <main>
        {/* Key Metrics */}
        <section id="key-metrics" className="mb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            <KpiCard
              title="Estimated Plugin Wait"
              value={estimatedPluginWaitDays}
              range={pluginWaitRange}
              color="text-sky-600"
            />
            <KpiCard
              title="Estimated Theme Wait"
              value={estimatedThemeWaitDays}
              range={themeWaitRange}
              color="text-pink-600"
            />
            <KpiCard
              title="Total Queue Size"
              value={readyForReviewPrs.length}
            />
            <KpiCard
              title="Plugin Queue"
              value={readyPlugins.length}
            />
            <KpiCard
              title="Theme Queue"
              value={readyThemes.length}
            />
          </div>
        </section>

        {/* Timeline Chart */}
        <TimelineChart
          chartData={chartData}
          chartFilter={chartFilter}
          setChartFilter={setChartFilter}
        />

        {/* Current Queue Table */}
        <QueueTable
          readyForReviewPrs={readyForReviewPrs}
        />
      </main>

      <footer className="text-center mt-12 py-6 border-t border-slate-200">
        <p className="text-sm text-slate-500">All calculations are estimates. Not affiliated with Obsidian MD.</p>
      </footer>
    </div>
  );
}

export default App;