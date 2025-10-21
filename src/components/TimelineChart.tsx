import React from 'react';
import { Bar } from 'react-chartjs-2';
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

interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
}

interface ChartDataType {
  labels: string[];
  datasets: ChartDataset[];
}

interface TimelineChartProps {
  chartData: ChartDataType;
  chartFilter: 'all' | 'plugin' | 'theme';
  setChartFilter: (filter: 'all' | 'plugin' | 'theme') => void;
}

const TimelineChart: React.FC<TimelineChartProps> = ({ chartData, chartFilter, setChartFilter }) => {
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
  );
};

export default TimelineChart;
