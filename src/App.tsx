import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import './App.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface PullRequest {
  id: number;
  title: string;
  url: string;
  type: 'plugin' | 'theme';
  createdAt: string;
}

interface MergedPullRequest extends PullRequest {
  mergedAt: string;
  daysToMerge: number;
}

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

  if (isLoadingOpenPrs || isLoadingMergedPrs) return <div className="text-center p-8 text-slate-500">Loading data...</div>;
  if (openPrsError) return <div className="text-center p-8 text-red-500">Error fetching open PRs: {openPrsError.message}</div>;
  if (mergedPrsError) return <div className="text-center p-8 text-red-500">Error fetching merged PRs: {mergedPrsError.message}</div>;

  const readyForReviewPrs = openPrs || [];
  const readyPlugins = readyForReviewPrs.filter(pr => pr.type === 'plugin');
  const readyThemes = readyForReviewPrs.filter(pr => pr.type === 'theme');

  const MOCK_VELOCITY_WEEKS = 12;
  const now = new Date();
  const twelveWeeksAgo = new Date(now.getTime() - MOCK_VELOCITY_WEEKS * 7 * 24 * 60 * 60 * 1000);

  // Helper to calculate average and standard deviation
  const calculateStats = (prs: MergedPullRequest[]) => {
    const daysToMergeValues = prs.map(pr => pr.daysToMerge);
    const mean = daysToMergeValues.reduce((sum, val) => sum + val, 0) / daysToMergeValues.length;
    const variance = daysToMergeValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / daysToMergeValues.length;
    const stdDev = Math.sqrt(variance);
    return { mean, stdDev };
  };

  // Calculate estimated plugin wait time with confidence interval
  const recentMergedPlugins = (mergedPrs || []).filter(pr => {
    const mergedDate = new Date(pr.mergedAt);
    return pr.type === 'plugin' && mergedDate > twelveWeeksAgo;
  });
  const pluginsPerWeek = recentMergedPlugins.length / MOCK_VELOCITY_WEEKS;
  const pluginStats = calculateStats(recentMergedPlugins);
  let estimatedPluginWaitDays: string | number = '∞';
  let pluginWaitRange: string = '';
  if (pluginsPerWeek > 0 && !isNaN(pluginStats.mean)) {
    const baseEstimate = (readyPlugins.length / pluginsPerWeek) * 7;
    const lowerBound = Math.round(baseEstimate - pluginStats.stdDev);
    const upperBound = Math.round(baseEstimate + pluginStats.stdDev);
    estimatedPluginWaitDays = Math.round(baseEstimate);
    pluginWaitRange = `(${Math.max(0, lowerBound)}-${upperBound} days)`;
  }

  // Calculate estimated theme wait time with confidence interval
  const recentMergedThemes = (mergedPrs || []).filter(pr => {
    const mergedDate = new Date(pr.mergedAt);
    return pr.type === 'theme' && mergedDate > twelveWeeksAgo;
  });
  const themesPerWeek = recentMergedThemes.length / MOCK_VELOCITY_WEEKS;
  const themeStats = calculateStats(recentMergedThemes);
  let estimatedThemeWaitDays: string | number = '∞';
  let themeWaitRange: string = '';
  if (themesPerWeek > 0 && !isNaN(themeStats.mean)) {
    const baseEstimate = (readyThemes.length / themesPerWeek) * 7;
    const lowerBound = Math.round(baseEstimate - themeStats.stdDev);
    const upperBound = Math.round(baseEstimate + themeStats.stdDev);
    estimatedThemeWaitDays = Math.round(baseEstimate);
    themeWaitRange = `(${Math.max(0, lowerBound)}-${upperBound} days)`;
  }

  // Chart data processing
  const weeklyData: { [key: string]: { plugins: number; themes: number } } = {};
  // const now = new Date();
  // const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);

  (mergedPrs || []).forEach(pr => {
    const mergedDate = new Date(pr.mergedAt);
    if (mergedDate < twelveWeeksAgo) return; // Only consider last 12 weeks for chart

    const weekStart = new Date(mergedDate);
    weekStart.setDate(mergedDate.getDate() - mergedDate.getDay());
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

  const chartDatasets = [];
  if (chartFilter === 'all' || chartFilter === 'plugin') {
    chartDatasets.push({
      label: 'Plugins Merged',
      data: pluginCounts,
      backgroundColor: 'rgb(2, 132, 199)', // sky-600
      borderColor: 'rgb(2, 132, 199)',
      borderWidth: 1
    });
  }
  if (chartFilter === 'all' || chartFilter === 'theme') {
    chartDatasets.push({
      label: 'Themes Merged',
      data: themeCounts,
      backgroundColor: 'rgb(219, 39, 119)', // pink-600
      borderColor: 'rgb(219, 39, 119)',
      borderWidth: 1
    });
  }

  const chartData = {
    labels,
    datasets: chartDatasets,
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        stacked: true,
        grid: { display: false }
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          stepSize: 1
        }
      }
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      }
    }
  };

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
            <div className="metric-card">
              <h3 className="text-lg font-semibold text-slate-500">Estimated Plugin Wait</h3>
              <p id="wait-time" className="text-5xl font-bold text-sky-600 mt-2">{estimatedPluginWaitDays} days</p>
              <p className="text-sm text-slate-400 mt-1">{pluginWaitRange}</p>
              <p className="text-sm text-slate-400 mt-1">Based on recent review velocity</p>
            </div>
            <div className="metric-card">
              <h3 className="text-lg font-semibold text-slate-500">Estimated Theme Wait</h3>
              <p id="theme-wait-time" className="text-5xl font-bold text-pink-600 mt-2">{estimatedThemeWaitDays} days</p>
              <p className="text-sm text-slate-400 mt-1">{themeWaitRange}</p>
              <p className="text-sm text-slate-400 mt-1">Based on recent review velocity</p>
            </div>
            <div className="metric-card">
              <h3 className="text-lg font-semibold text-slate-500">Total Queue Size</h3>
              <p id="total-queue" className="text-5xl font-bold text-slate-700 mt-2">{readyForReviewPrs.length}</p>
              <p className="text-sm text-slate-400 mt-1">PRs "Ready for review"</p>
            </div>
            <div className="metric-card">
              <h3 className="text-lg font-semibold text-slate-500">Plugin Queue</h3>
              <p id="plugin-queue" className="text-5xl font-bold text-slate-700 mt-2">{readyPlugins.length}</p>
              <p className="text-sm text-slate-400 mt-1">"plugin" & "Ready for review"</p>
            </div>
            <div className="metric-card">
              <h3 className="text-lg font-semibold text-slate-500">Theme Queue</h3>
              <p id="theme-queue" className="text-5xl font-bold text-slate-700 mt-2">{readyThemes.length}</p>
              <p className="text-sm text-slate-400 mt-1">"theme" & "Ready for review"</p>
            </div>
          </div>
        </section>

        {/* Timeline Chart */}
        <section className="mb-10 bg-white p-6 rounded-xl shadow-lg">
          <div className="flex flex-col md:flex-row justify-between items-center mb-4">
            <div className="text-center md:text-left">
              <h2 className="text-2xl font-bold text-slate-800">Merged PRs Timeline</h2>
              <p className="text-slate-500">Represents the number of plugins and themes approved per week.</p>
            </div>
            <div id="chart-filters" className="flex space-x-2 mt-4 md:mt-0" role="group">
              <button
                data-type="all"
                className={`filter-btn px-4 py-2 rounded-md font-semibold shadow ${chartFilter === 'all' ? 'bg-sky-600 text-white' : 'bg-white text-slate-700'}`}
                onClick={() => setChartFilter('all')}
              >
                All
              </button>
              <button
                data-type="plugin"
                className={`filter-btn px-4 py-2 rounded-md font-semibold shadow ${chartFilter === 'plugin' ? 'bg-sky-600 text-white' : 'bg-white text-slate-700'}`}
                onClick={() => setChartFilter('plugin')}
              >
                Plugins
              </button>
              <button
                data-type="theme"
                className={`filter-btn px-4 py-2 rounded-md font-semibold shadow ${chartFilter === 'theme' ? 'bg-sky-600 text-white' : 'bg-white text-slate-700'}`}
                onClick={() => setChartFilter('theme')}
              >
                Themes
              </button>
            </div>
          </div>
          <div className="chart-container">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </section>

        {/* Current Queue Table */}
        <section className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Current "Ready for review" Queue</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">PR #</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Title</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted</th>
                </tr>
              </thead>
              <tbody id="queue-table-body" className="bg-white divide-y divide-slate-200">
                {readyForReviewPrs.length === 0 ? (
                  <tr><td colSpan={4} className="text-center p-8 text-slate-500">The queue is empty!</td></tr>
                ) : (
                  readyForReviewPrs.map(pr => (
                    <tr key={pr.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:text-sky-800">#{pr.id}</a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${pr.type === 'plugin' ? 'bg-sky-100 text-sky-800' : 'bg-pink-100 text-pink-800'}`}>
                          {pr.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 truncate" style={{ maxWidth: '300px' }}>{pr.title}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{new Date(pr.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="text-center mt-12 py-6 border-t border-slate-200">
        <p className="text-sm text-slate-500">This is a mock-up using sample data. All calculations are estimates. Not affiliated with Obsidian MD.</p>
      </footer>
    </div>
  );
}

export default App;
