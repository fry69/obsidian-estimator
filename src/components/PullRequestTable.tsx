import React, { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { VirtualItem } from "@tanstack/react-virtual";
import type {
  MergedPullRequest,
  PullRequest,
  SubmissionFilter,
} from "../types.ts";
import { usePersistentState } from "../hooks/usePersistentState.ts";
import { useRelativeTime } from "../hooks/useRelativeTime.ts";

type SortColumn = "id" | "type" | "title" | "date" | "days";
type SortDirection = "asc" | "desc";

type PullRequestTableProps =
  | {
      variant: "queue";
      prs: PullRequest[];
      filterType: SubmissionFilter;
      setFilterType: (filter: SubmissionFilter) => void;
    }
  | {
      variant: "merged";
      prs: MergedPullRequest[];
      filterType: SubmissionFilter;
      setFilterType: (filter: SubmissionFilter) => void;
    };

const cleanTitle = (title: string) => {
  if (title.startsWith("Add plugin: ")) {
    return title.replace("Add plugin: ", "");
  }
  if (title.startsWith("Add theme: ")) {
    return title.replace("Add theme: ", "");
  }
  return title;
};

const formatRelativeToken = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const units: Array<[number, string]> = [
    [31536000, "y"],
    [2592000, "mo"],
    [604800, "w"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];

  for (const [unitSeconds, suffix] of units) {
    const value = Math.floor(seconds / unitSeconds);
    if (value >= 1) {
      return `${value}${suffix}`;
    }
  }

  return `${Math.max(seconds, 0)}s`;
};

const buttonBase =
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";
const inactiveButtonClasses =
  "border border-[color:var(--border)] bg-[color:var(--surface-muted)] text-[color:var(--foreground)] shadow-sm hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)]";
const activeButtonClasses =
  "border border-transparent bg-[color:var(--accent-button-bg)] text-[color:var(--accent-button-text)] shadow-[var(--shadow-accent)]";

const PullRequestTable: React.FC<PullRequestTableProps> = (props) => {
  const { filterType, setFilterType, variant } = props;
  const prs = props.prs;
  const isMergedView = variant === "merged";
  const filterStorageKey = isMergedView
    ? "mergedTableFilter"
    : "queueTableFilter";
  const filterInputId = isMergedView ? "merged-filter" : "queue-filter";

  const [sortColumn, setSortColumn] = useState<SortColumn>(() =>
    isMergedView ? "date" : "id",
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filterQuery, setFilterQuery] = usePersistentState<string>(
    filterStorageKey,
    "",
  );

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilterQuery(event.target.value);
  };

  const handleFilterKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setFilterQuery("");
    }
  };

  const clearFilterQuery = () => {
    setFilterQuery("");
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const isFiltered = filterQuery.trim().length > 0;

  const sortedAndFilteredPrs = useMemo(() => {
    const normalizedQuery = filterQuery.trim().toLowerCase();
    const compactQuery = normalizedQuery.replace(/\s+/g, "");
    const isNumericQuery =
      compactQuery.length > 0 && /^\d+$/.test(compactQuery);
    const isTimeQuery =
      compactQuery.length > 0 && /^\d+[a-z]+$/.test(compactQuery);

    const filteredPrs = prs.filter((pr) => {
      if (filterType !== "all" && pr.type !== filterType) {
        return false;
      }

      if (!compactQuery) {
        return true;
      }

      if (isNumericQuery) {
        return pr.id.toString().includes(compactQuery);
      }

      if (isTimeQuery) {
        const targetDate =
          variant === "merged"
            ? (pr as MergedPullRequest).mergedAt
            : pr.createdAt;
        const prTimeAgo = formatRelativeToken(targetDate).toLowerCase();
        return prTimeAgo.includes(compactQuery);
      }

      const normalizedTitle = cleanTitle(pr.title).toLowerCase();
      return normalizedTitle.includes(normalizedQuery);
    });

    const sortablePrs = [...filteredPrs];

    sortablePrs.sort((a, b) => {
      let compareValue = 0;
      if (sortColumn === "id") {
        compareValue = a.id - b.id;
      } else if (sortColumn === "type") {
        compareValue = a.type.localeCompare(b.type);
      } else if (sortColumn === "title") {
        compareValue = cleanTitle(a.title).localeCompare(cleanTitle(b.title));
      } else if (sortColumn === "date") {
        const aDate =
          variant === "merged"
            ? new Date((a as MergedPullRequest).mergedAt).getTime()
            : new Date(a.createdAt).getTime();
        const bDate =
          variant === "merged"
            ? new Date((b as MergedPullRequest).mergedAt).getTime()
            : new Date(b.createdAt).getTime();
        compareValue = aDate - bDate;
      } else if (sortColumn === "days" && variant === "merged") {
        compareValue =
          (a as MergedPullRequest).daysToMerge -
          (b as MergedPullRequest).daysToMerge;
      }
      return sortDirection === "asc" ? compareValue : -compareValue;
    });
    return sortablePrs as typeof prs;
  }, [prs, filterType, sortColumn, sortDirection, filterQuery, variant]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: sortedAndFilteredPrs.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 68,
    overscan: 12,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();

  const renderSortIndicator = (column: SortColumn) => {
    if (sortColumn === column) {
      return sortDirection === "asc" ? " ▲" : " ▼";
    }
    return "";
  };

  const renderButton = (label: string, type: SubmissionFilter) => (
    <button
      key={type}
      data-type={type}
      type="button"
      onClick={() => setFilterType(type)}
      className={`${buttonBase} ${
        filterType === type ? activeButtonClasses : inactiveButtonClasses
      }`}
    >
      {label}
    </button>
  );

  const heading = isMergedView
    ? "Recently Merged Pull Requests"
    : "Current Pull Request Queue";
  const subheading = isMergedView
    ? "Merged in the last 7 days"
    : '"Ready for review"';
  const emptyMessage = isMergedView
    ? "No pull requests were merged in the last 7 days."
    : "The queue is empty!";
  const dateColumnLabel = isMergedView ? "Merged" : "Submitted";
  const gridTemplateColumns = isMergedView
    ? "minmax(90px,120px) minmax(90px,120px) minmax(220px,1fr) minmax(120px,140px) minmax(60px,100px)"
    : "minmax(90px,120px) minmax(90px,120px) minmax(220px,1fr) minmax(120px,140px)";
  const headerCells: Array<{ key: SortColumn; label: string }> = [
    { key: "id", label: "PR #" },
    { key: "type", label: "Type" },
    { key: "title", label: "Title" },
    { key: "date", label: dateColumnLabel },
  ];
  if (isMergedView) {
    headerCells.push({ key: "days", label: "Days" });
  }

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-6 shadow-[var(--shadow-soft)] transition-[background-color,border-color,box-shadow] duration-300 sm:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
          {heading}
          {subheading ? (
            <span className="block text-sm font-normal text-[color:var(--muted)]">
              {subheading}
            </span>
          ) : null}
        </h2>
        <div className="flex flex-wrap gap-2" role="group">
          {renderButton("All", "all")}
          {renderButton("Plugins", "plugin")}
          {renderButton("Themes", "theme")}
        </div>
      </div>
      <div className="mt-4 flex justify-center">
        <div className="relative w-full max-w-xl sm:max-w-md">
          <input
            id={filterInputId}
            type="text"
            value={filterQuery}
            onChange={handleFilterChange}
            onKeyDown={handleFilterKeyDown}
            placeholder="Search by PR #, title, or time (e.g. 2d)"
            className={`w-full rounded-full bg-[color:var(--surface)] px-4 py-2 pr-12 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted)] transition-[border-color,box-shadow] focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-500/40 ${
              isFiltered
                ? "border-2 border-[color:var(--accent)] shadow-[0_0_0_1px_rgba(56,189,248,0.25)] dark:shadow-[0_0_0_1px_rgba(56,189,248,0.3)]"
                : "border border-[color:var(--border)]"
            }`}
          />
          {filterQuery && (
            <button
              type="button"
              onClick={clearFilterQuery}
              className="absolute inset-y-0 right-3 inline-flex items-center justify-center rounded-full p-1 text-[color:var(--muted)] transition-colors hover:text-[color:var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
              aria-label="Clear filter"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          )}
        </div>
      </div>
      <div className="mt-6 overflow-x-auto">
        <div
          className="min-w-full"
          role="table"
          aria-label={heading}
          aria-rowcount={sortedAndFilteredPrs.length}
        >
          <div role="rowgroup">
            <div
              role="row"
              className="grid items-center gap-3 bg-[color:var(--surface)] px-6 py-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]"
              style={{ gridTemplateColumns }}
            >
              {headerCells.map(({ key, label }) => {
                const ariaSort =
                  sortColumn === key
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none";
                return (
                  <div key={key} role="columnheader" aria-sort={ariaSort}>
                    <button
                      type="button"
                      onClick={() => handleSort(key)}
                      className="flex items-center gap-1 text-left uppercase tracking-wide text-[color:var(--muted)] transition-colors hover:text-[color:var(--foreground)]"
                    >
                      <span>{label}</span>
                      <span aria-hidden="true">{renderSortIndicator(key)}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div
            ref={scrollContainerRef}
            role="presentation"
            className="max-h-[28rem] overflow-y-auto border-t border-[color:var(--border)]"
          >
            {sortedAndFilteredPrs.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-[color:var(--muted)]">
                {emptyMessage}
              </div>
            ) : (
              <div
                role="rowgroup"
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: "relative",
                }}
              >
                {virtualItems.map((virtualRow) => {
                  const pr = sortedAndFilteredPrs[virtualRow.index]!;
                  const mergedPr = isMergedView
                    ? (pr as MergedPullRequest)
                    : null;

                  return (
                    <VirtualizedRow
                      key={virtualRow.key}
                      virtualRow={virtualRow}
                      pr={pr}
                      mergedPr={mergedPr}
                      isMergedView={isMergedView}
                      gridTemplateColumns={gridTemplateColumns}
                      measureElement={rowVirtualizer.measureElement}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PullRequestTable;

interface VirtualRowProps {
  virtualRow: VirtualItem;
  pr: PullRequest;
  mergedPr: MergedPullRequest | null;
  isMergedView: boolean;
  gridTemplateColumns: string;
  measureElement: (el: HTMLElement | null) => void;
}

const VirtualizedRow: React.FC<VirtualRowProps> = ({
  virtualRow,
  pr,
  mergedPr,
  isMergedView,
  gridTemplateColumns,
  measureElement,
}) => {
  const relativeTime = useRelativeTime(
    isMergedView && mergedPr ? mergedPr.mergedAt : pr.createdAt,
  );

  const badgeClasses =
    pr.type === "plugin"
      ? "badge-plugin"
      : pr.type === "theme"
        ? "badge-theme"
        : "bg-gray-500/10 text-gray-600 dark:bg-gray-400/20 dark:text-gray-200";

  return (
    <div
      role="row"
      ref={measureElement}
      data-index={virtualRow.index}
      className="grid items-center gap-3 px-6 py-4 transition-[background-color] duration-150 hover:bg-[color:var(--surface-hover)]"
      style={{
        gridTemplateColumns,
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: `${virtualRow.size}px`,
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      <div
        role="cell"
        className="text-sm font-semibold text-[color:var(--foreground)]"
      >
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="link-plugin"
        >
          #{pr.id}
        </a>
      </div>
      <div role="cell" className="text-sm">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${badgeClasses}`}
        >
          {pr.type}
        </span>
      </div>
      <div role="cell" className="text-sm text-[color:var(--muted)]">
        <span className="block max-w-[320px] truncate">
          {cleanTitle(pr.title)}
        </span>
      </div>
      <div role="cell" className="text-sm text-[color:var(--muted)]">
        {relativeTime}
      </div>
      {isMergedView ? (
        <div role="cell" className="text-sm text-[color:var(--muted)]">
          {mergedPr?.daysToMerge ?? ""}
        </div>
      ) : null}
    </div>
  );
};
