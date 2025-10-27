import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MergedPullRequest, PullRequest, SubmissionFilter } from "./types";
import { isSubmissionFilter } from "./types";
import { calculateWaitTime, generateChartData } from "./lib/calculations";
import KpiCard from "./components/KpiCard";
import TimelineChart from "./components/TimelineChart";
import PullRequestTable from "./components/PullRequestTable";
import ThemeToggle from "./components/ThemeToggle";
import { useTheme } from "./hooks/useTheme";
import { usePersistentState } from "./hooks/usePersistentState";
import { fetchQueueData } from "./lib/fetchQueueData";

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

  const { data, isLoading, error } = useQuery<{
    openPrs: PullRequest[];
    mergedPrs: MergedPullRequest[];
  }>({
    queryKey: ["prData"],
    queryFn: fetchQueueData,
    refetchInterval: 1000 * 60 * 30, // 30 minutes
    staleTime: 1000 * 60 * 30,
  });

  const openPrs = data?.openPrs;
  const mergedPrs = data?.mergedPrs;

  const readyForReviewPrs = useMemo(() => openPrs || [], [openPrs]);
  const readyPlugins = useMemo(
    () => readyForReviewPrs.filter((pr) => pr.type === "plugin"),
    [readyForReviewPrs],
  );
  const readyThemes = useMemo(
    () => readyForReviewPrs.filter((pr) => pr.type === "theme"),
    [readyForReviewPrs],
  );

  const recentMergedPrs = useMemo(() => {
    if (!mergedPrs) {
      return [];
    }
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const threshold = sevenDaysAgo.getTime();

    return mergedPrs.filter(
      (pr) => new Date(pr.mergedAt).getTime() >= threshold,
    );
  }, [mergedPrs]);

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
            <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
              Key metrics
            </h2>
            <section
              id="key-metrics"
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5"
            >
              <KpiCard
                title="Plugin Wait"
                value={estimatedPluginWaitDays}
                range={pluginWaitRange}
                color="text-plugin-accent"
                warning={
                  isPluginWaitHighVariance
                    ? "Estimates may be less reliable due to high variance."
                    : ""
                }
                note="This is an estimate for new submissions and may be high due to the large queue size."
                description="Based on recent review velocity"
              />
              <KpiCard
                title="Theme Wait"
                value={estimatedThemeWaitDays}
                range={themeWaitRange}
                color="text-theme-accent"
                warning={
                  isThemeWaitHighVariance
                    ? "Estimates may be less reliable due to high variance."
                    : ""
                }
                description="Based on recent review velocity"
              />
              <KpiCard
                title="Total Queue"
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
              {activeTable === "queue" ? (
                <PullRequestTable
                  key="queue-table"
                  variant="queue"
                  prs={readyForReviewPrs}
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
            All calculations are estimates. Not affiliated with Obsidian MD.
            <br />© 2025{" "}
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
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
