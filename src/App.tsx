import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  QueueDetailsResponse,
  QueueSummary,
  SubmissionFilter,
  WaitEstimateSummary,
} from "./types";
import { isSubmissionFilter } from "./types";
import KpiCard from "./components/KpiCard";
import TimelineChart from "./components/TimelineChart";
import PullRequestTable from "./components/PullRequestTable";
import ThemeToggle from "./components/ThemeToggle";
import { useTheme } from "./hooks/useTheme";
import { usePersistentState } from "./hooks/usePersistentState";
import { fetchQueueSummary } from "./lib/fetchQueueSummary";
import { fetchQueueDetails } from "./lib/fetchQueueDetails";
import {
  formatAbsoluteDate,
  useRelativeTime,
} from "./hooks/useRelativeTime";

type TableVariant = "queue" | "merged";

const isTableVariant = (value: string): value is TableVariant => {
  return value === "queue" || value === "merged";
};

function App() {
  const { theme, toggleTheme } = useTheme();
  const [chartFilter, setChartFilter] = usePersistentState<SubmissionFilter>(
    "chartFilterType",
    "all",
    {
      validate: isSubmissionFilter,
    },
  );
  const [queueFilter, setQueueFilter] = usePersistentState<SubmissionFilter>(
    "queueTableFilterType",
    "all",
    {
      validate: isSubmissionFilter,
    },
  );
  const [mergedFilter, setMergedFilter] = usePersistentState<SubmissionFilter>(
    "mergedTableFilterType",
    "all",
    {
      validate: isSubmissionFilter,
    },
  );
  const [activeTable, setActiveTable] = usePersistentState<TableVariant>(
    "activeTableVariant",
    "queue",
    {
      validate: isTableVariant,
    },
  );

  const {
    data: summary,
    isLoading: isSummaryLoading,
    error: summaryError,
  } = useQuery<QueueSummary>({
    queryKey: ["queue-summary"],
    queryFn: fetchQueueSummary,
    refetchInterval: 1000 * 60 * 30,
    staleTime: 1000 * 60 * 30,
  });

  const detailsVersion = summary?.detailsVersion ?? null;

  const {
    data: details,
    isPending: isDetailsPending,
    error: detailsError,
  } = useQuery<QueueDetailsResponse>({
    queryKey: ["queue-details", detailsVersion],
    queryFn: () => fetchQueueDetails(detailsVersion ?? undefined),
    enabled: Boolean(detailsVersion),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const openPrs = useMemo(() => details?.openPrs ?? [], [details]);
  const mergedPrs = useMemo(() => details?.mergedPrs ?? [], [details]);

  const detailsErrorMessage =
    detailsError instanceof Error
      ? detailsError.message
      : detailsError
        ? "Unknown error"
        : null;

  const recentMergedPrs = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const threshold = sevenDaysAgo.getTime();

    return mergedPrs.filter(
      (pr) => new Date(pr.mergedAt).getTime() >= threshold,
    );
  }, [mergedPrs]);

  const formatWaitValue = (estimate?: WaitEstimateSummary) => {
    if (!estimate) {
      return "–";
    }
    return estimate.estimatedDays ?? "∞";
  };

  const formatWaitRange = (estimate?: WaitEstimateSummary) => {
    if (!estimate) {
      return "";
    }
    const { lower, upper } = estimate.range;
    if (lower === null || upper === null) {
      return "";
    }
    return `(${lower}–${upper} days)`;
  };

  const chartData = useMemo(() => {
    if (!summary || summary.weeklyMerged.weekStarts.length === 0) {
      return undefined;
    }

    const labels = summary.weeklyMerged.weekStarts.map((week) =>
      new Date(week).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    );

    const datasets: Array<{
      label: string;
      data: number[];
      backgroundColor: string;
      borderColor: string;
      borderWidth: number;
    }> = [];

    if (chartFilter === "all" || chartFilter === "plugin") {
      datasets.push({
        label: "Plugins Merged",
        data: summary.weeklyMerged.pluginCounts,
        backgroundColor: "rgb(2, 132, 199)",
        borderColor: "rgb(2, 132, 199)",
        borderWidth: 1,
      });
    }

    if (chartFilter === "all" || chartFilter === "theme") {
      datasets.push({
        label: "Themes Merged",
        data: summary.weeklyMerged.themeCounts,
        backgroundColor: "rgb(219, 39, 119)",
        borderColor: "rgb(219, 39, 119)",
        borderWidth: 1,
      });
    }

    return { labels, datasets };
  }, [summary, chartFilter]);

  const checkedRelative = useRelativeTime(summary?.checkedAt);
  const changedRelative = useRelativeTime(summary?.detailsUpdatedAt);
  const checkedAbsolute = formatAbsoluteDate(summary?.checkedAt);
  const changedAbsolute = formatAbsoluteDate(summary?.detailsUpdatedAt);

  const tableTabs: Array<{ id: TableVariant; label: string }> = [
    { id: "merged", label: "Merged (7d)" },
    { id: "queue", label: "Ready for Review (full)" },
  ];
  const tabButtonBase =
    "relative inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";
  const tabActiveClasses =
    "bg-[color:var(--accent-button-bg)] text-[color:var(--accent-button-text)] shadow-[var(--shadow-accent)]";
  const tabInactiveClasses =
    "text-[color:var(--muted)] hover:text-[color:var(--foreground)]";

  if (isSummaryLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] text-[color:var(--muted)] transition-[background-color,color] duration-300">
        Loading data...
      </div>
    );
  }

  if (summaryError) {
    const message =
      summaryError instanceof Error ? summaryError.message : "Unknown error";
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] text-red-500 transition-[background-color,color] duration-300">
        Error fetching data: {message}
      </div>
    );
  }

  const pluginEstimate = summary?.waitEstimates.plugin;
  const themeEstimate = summary?.waitEstimates.theme;

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
            <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
              Key metrics
            </h2>
            <section
              id="key-metrics"
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5"
            >
              <KpiCard
                title="Plugin Wait"
                value={formatWaitValue(pluginEstimate)}
                range={formatWaitRange(pluginEstimate)}
                color="text-plugin-accent"
                warning={
                  pluginEstimate?.isHighVariance
                    ? "Estimates may be less reliable due to high variance."
                    : ""
                }
                note="This is an estimate for new submissions and may be high due to the large queue size."
                description="Based on recent review velocity"
              />
              <KpiCard
                title="Theme Wait"
                value={formatWaitValue(themeEstimate)}
                range={formatWaitRange(themeEstimate)}
                color="text-theme-accent"
                warning={
                  themeEstimate?.isHighVariance
                    ? "Estimates may be less reliable due to high variance."
                    : ""
                }
                description="Based on recent review velocity"
              />
              <KpiCard
                title="Total Queue"
                value={summary?.totals.readyTotal ?? "–"}
                description='PRs "Ready for review"'
              />
              <KpiCard
                title="Plugin Queue"
                value={summary?.totals.readyPlugins ?? "–"}
                description='"plugin" &amp; "Ready for review"'
              />
              <KpiCard
                title="Theme Queue"
                value={summary?.totals.readyThemes ?? "–"}
                description='"theme" & "Ready for review"'
              />
            </section>

            {chartData !== undefined && (
              <TimelineChart
                chartData={chartData}
                chartFilter={chartFilter}
                setChartFilter={setChartFilter}
                theme={theme}
              />
            )}

            <section className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <nav
                  aria-label="Table selection"
                  className="inline-flex rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-1 shadow-[var(--shadow-soft)]"
                >
                  {tableTabs.map((tab) => {
                    const isActive = activeTable === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTable(tab.id)}
                        className={`${tabButtonBase} ${
                          isActive ? tabActiveClasses : tabInactiveClasses
                        }`}
                        aria-pressed={isActive}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </nav>
              </div>
              {isDetailsPending ? (
                <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)] text-[color:var(--muted)]">
                  Loading detailed pull requests…
                </div>
              ) : detailsErrorMessage ? (
                <div className="rounded-2xl border border-red-400/40 bg-red-400/10 px-4 py-6 text-sm text-red-300">
                  Failed to load detailed pull requests: {detailsErrorMessage}
                </div>
              ) : activeTable === "queue" ? (
                <PullRequestTable
                  key="queue-table"
                  variant="queue"
                  prs={openPrs}
                  filterType={queueFilter}
                  setFilterType={setQueueFilter}
                />
              ) : (
                <PullRequestTable
                  key="merged-table"
                  variant="merged"
                  prs={recentMergedPrs}
                  filterType={mergedFilter}
                  setFilterType={setMergedFilter}
                />
              )}
            </section>
          </main>

          <footer className="border-t border-[color:var(--border-strong)] pt-6 text-center text-sm text-[color:var(--muted)]">
            <p className="mb-3">
              <span className="font-semibold">Last check:</span>{" "}
              <span title={checkedAbsolute}>{checkedRelative}</span>
              <span className="mx-2">·</span>
              <span className="font-semibold">Last change:</span>{" "}
              <span title={changedAbsolute}>{changedRelative}</span>
            </p>
            <p>All calculations are estimates. Not affiliated with Obsidian MD.</p>
            <p className="mt-1">
              © 2025{" "}
              <a
                href="https://bsky.app/profile/fry69.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[color:var(--text)]"
              >
                fry69
              </a>
              . Source on{" "}
              <a
                href="https://github.com/fry69/obsidian-estimator"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[color:var(--text)]"
              >
                GitHub
              </a>
              . Version: {import.meta.env["VITE_APP_VERSION"]} Build:{" "}
              {import.meta.env["VITE_BUILD_ID"]}
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
