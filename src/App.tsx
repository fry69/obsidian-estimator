import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MergedPullRequest, PullRequest } from "./types";
import { calculateWaitTime, generateChartData } from "./lib/calculations";
import KpiCard from "./components/KpiCard";
import TimelineChart from "./components/TimelineChart";
import QueueTable from "./components/QueueTable";
import ThemeToggle from "./components/ThemeToggle";
import { useTheme } from "./hooks/useTheme";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function App() {
  const { theme, toggleTheme } = useTheme();
  const [chartFilter, setChartFilter] = useState<"all" | "plugin" | "theme">(
    "all"
  );
  const [queueFilter, setQueueFilter] = useState<"all" | "plugin" | "theme">(
    "all"
  );

  const { data, isLoading, error } = useQuery<{
    openPrs: PullRequest[];
    mergedPrs: MergedPullRequest[];
  }>({
    queryKey: ["prData"],
    queryFn: async () => {
      const response = await fetch("/api/data");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
    refetchInterval: 1000 * 60 * 30, // 30 minutes
  });

  const openPrs = data?.openPrs;
  const mergedPrs = data?.mergedPrs;

  const readyForReviewPrs = useMemo(() => openPrs || [], [openPrs]);
  const readyPlugins = useMemo(
    () => readyForReviewPrs.filter((pr) => pr.type === "plugin"),
    [readyForReviewPrs]
  );
  const readyThemes = useMemo(
    () => readyForReviewPrs.filter((pr) => pr.type === "theme"),
    [readyForReviewPrs]
  );

  const {
    estimatedDays: estimatedPluginWaitDays,
    waitRange: pluginWaitRange,
    isHighVariance: isPluginWaitHighVariance,
  } = useMemo(() => {
    return calculateWaitTime(mergedPrs || [], "plugin");
  }, [mergedPrs]);

  const {
    estimatedDays: estimatedThemeWaitDays,
    waitRange: themeWaitRange,
    isHighVariance: isThemeWaitHighVariance,
  } = useMemo(() => {
    return calculateWaitTime(mergedPrs || [], "theme");
  }, [mergedPrs]);

  const chartData = useMemo(() => {
    return generateChartData(mergedPrs || [], chartFilter);
  }, [mergedPrs, chartFilter]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] text-[color:var(--muted)] transition-[background-color,color] duration-300">
        Loading data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] text-red-500 transition-[background-color,color] duration-300">
        Error fetching data: {error.message}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)] transition-[background-color,color] duration-300">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-10 md:px-8 lg:px-12">
        <div className="flex flex-1 flex-col gap-12 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-8 shadow-[var(--shadow-soft)] transition-[background-color,border-color,box-shadow] duration-300 md:px-10 md:py-12">
          <header className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[color:var(--muted)]">
                  Queue insights
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                  Obsidian Release PR Queue
                </h1>
                <p className="mt-3 text-base text-[color:var(--muted)]">
                  Dashboard for community plugin &amp; theme submissions.
                </p>
              </div>
              <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
            </div>
          </header>

          <main className="flex flex-col gap-12">
            <section
              id="key-metrics"
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5"
            >
              <KpiCard
                title="Estimated Plugin Wait"
                value={estimatedPluginWaitDays}
                range={pluginWaitRange}
                color="text-sky-500 dark:text-sky-400"
                warning={
                  isPluginWaitHighVariance
                    ? "Estimates may be less reliable due to high variance."
                    : undefined
                }
                note="This is an estimate for new submissions and may be high due to the large queue size."
                description="Based on recent review velocity"
              />
              <KpiCard
                title="Estimated Theme Wait"
                value={estimatedThemeWaitDays}
                range={themeWaitRange}
                color="text-pink-500 dark:text-pink-400"
                warning={
                  isThemeWaitHighVariance
                    ? "Estimates may be less reliable due to high variance."
                    : undefined
                }
                description="Based on recent review velocity"
              />
              <KpiCard
                title="Total Queue Size"
                value={readyForReviewPrs.length}
                description='PRs "Ready for review"'
              />
              <KpiCard
                title="Plugin Queue"
                value={readyPlugins.length}
                description='"plugin" &amp; "Ready for review"'
              />
              <KpiCard
                title="Theme Queue"
                value={readyThemes.length}
                description='"theme" & "Ready for review"'
              />
            </section>

            <TimelineChart
              chartData={chartData}
              chartFilter={chartFilter}
              setChartFilter={setChartFilter}
            />

            <QueueTable
              readyForReviewPrs={readyForReviewPrs}
              filterType={queueFilter}
              setFilterType={setQueueFilter}
            />
          </main>

          <footer className="border-t border-[color:var(--border-strong)] pt-6 text-center text-sm text-[color:var(--muted)]">
            All calculations are estimates. Not affiliated with Obsidian MD.
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
