import React, { useMemo } from "react";
import type { ChartOptions } from "chart.js";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import type { Theme } from "../hooks/useTheme.ts";
import type { SubmissionFilter } from "../types.ts";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
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
  chartFilter: SubmissionFilter;
  setChartFilter: (filter: SubmissionFilter) => void;
  theme: Theme;
}

const buttonBase =
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";
const inactiveButtonClasses =
  "border border-[color:var(--border)] bg-[color:var(--surface-muted)] text-[color:var(--foreground)] shadow-sm hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)]";
const activeButtonClasses =
  "border border-transparent bg-[color:var(--accent-button-bg)] text-[color:var(--accent-button-text)] shadow-[var(--shadow-accent)]";

const TimelineChart: React.FC<TimelineChartProps> = ({
  chartData,
  chartFilter,
  setChartFilter,
  theme,
}) => {
  const chartOptions = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 250,
      animation: false,
      responsiveAnimationDuration: 0,
      interaction: {
        mode: "index",
        intersect: false,
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: {
            color: theme === "dark" ? "#cbd5e1" : "#64748b",
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            color: theme === "dark" ? "#cbd5e1" : "#64748b",
          },
          grid: {
            color: theme === "dark" ? "#334155" : "#e2e8f0",
          },
        },
      },
      plugins: {
        legend: {
          position: "top" as const,
          labels: {
            color: theme === "dark" ? "#cbd5e1" : "#64748b",
          },
        },
        tooltip: {
          mode: "index",
          intersect: false,
        },
      },
    }),
    [theme],
  );

  if (!chartData) {
    return null;
  }

  const renderButton = (label: string, type: SubmissionFilter) => (
    <button
      key={type}
      data-type={type}
      type="button"
      onClick={() => setChartFilter(type)}
      className={`${buttonBase} ${
        chartFilter === type ? activeButtonClasses : inactiveButtonClasses
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-6 shadow-[var(--shadow-soft)] transition-[background-color,border-color,box-shadow] duration-300 sm:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2 text-center md:text-left">
          <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
            Merged PRs Timeline
          </h2>
          <p className="text-sm text-[color:var(--muted)]">
            Represents the number of plugins and themes approved per week.
          </p>
        </div>
        <div id="chart-filters" className="flex flex-wrap gap-2" role="group">
          {renderButton("All", "all")}
          {renderButton("Plugins", "plugin")}
          {renderButton("Themes", "theme")}
        </div>
      </div>
      <div className="relative mx-auto mt-8 h-[400px] max-h-[50vh] w-full max-w-[900px]">
        <Bar data={chartData} options={chartOptions} />
      </div>
    </section>
  );
};

export default TimelineChart;
