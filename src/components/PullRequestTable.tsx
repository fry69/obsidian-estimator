import React, { useEffect, useMemo, useState } from "react";
import type { MergedPullRequest, PullRequest } from "../types";

type FilterType = "all" | "plugin" | "theme";
type SortColumn = "id" | "type" | "title" | "date" | "days";
type SortDirection = "asc" | "desc";

type PullRequestTableProps =
  | {
      variant: "queue";
      prs: PullRequest[];
      filterType: FilterType;
      setFilterType: (filter: FilterType) => void;
    }
  | {
      variant: "merged";
      prs: MergedPullRequest[];
      filterType: FilterType;
      setFilterType: (filter: FilterType) => void;
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

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  let interval = seconds / 31536000; // years
  if (interval > 1) {
    return Math.floor(interval) + "y";
  }
  interval = seconds / 2592000; // months
  if (interval > 1) {
    return Math.floor(interval) + "mo";
  }
  interval = seconds / 604800; // weeks
  if (interval > 1) {
    return Math.floor(interval) + "w";
  }
  interval = seconds / 86400; // days
  if (interval > 1) {
    return Math.floor(interval) + "d";
  }
  interval = seconds / 3600; // hours
  if (interval > 1) {
    return Math.floor(interval) + "h";
  }
  interval = seconds / 60; // minutes
  if (interval > 1) {
    return Math.floor(interval) + "m";
  }
  return Math.floor(seconds) + "s";
};

const buttonBase =
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";
const inactiveButtonClasses =
  "border border-[color:var(--border)] bg-[color:var(--surface-muted)] text-[color:var(--foreground)] shadow-sm hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)]";
const activeButtonClasses =
  "border border-transparent bg-sky-500 text-white shadow-[0_20px_45px_-25px_rgba(56,189,248,0.7)]";

const PullRequestTable: React.FC<PullRequestTableProps> = (props) => {
  const { filterType, setFilterType, variant } = props;
  const prs = props.prs;
  const isMergedView = variant === "merged";
  const filterStorageKey = isMergedView
    ? "mergedTableFilter"
    : "queueTableFilter";
  const filterInputId = isMergedView ? "merged-filter" : "queue-filter";

  const [sortColumn, setSortColumn] = useState<SortColumn>(() =>
    isMergedView ? "date" : "id"
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filterQuery, setFilterQuery] = useState<string>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(filterStorageKey) ?? "";
    }
    return "";
  });

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      if (filterQuery) {
        window.localStorage.setItem(filterStorageKey, filterQuery);
      } else {
        window.localStorage.removeItem(filterStorageKey);
      }
    }
  }, [filterQuery, filterStorageKey]);

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilterQuery(event.target.value);
  };

  const handleFilterKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
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
        const prTimeAgo = formatRelativeTime(targetDate).toLowerCase();
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

  const renderSortIndicator = (column: SortColumn) => {
    if (sortColumn === column) {
      return sortDirection === "asc" ? " ▲" : " ▼";
    }
    return "";
  };

  const renderButton = (label: string, type: FilterType) => (
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
  const tableColumnCount = isMergedView ? 5 : 4;
  const dateColumnLabel = isMergedView ? "Merged" : "Submitted";

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
        <table className="min-w-full divide-y divide-[color:var(--border)] text-left">
          <thead className="bg-[color:var(--surface)]">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]"
                onClick={() => handleSort("id")}
              >
                PR #{renderSortIndicator("id")}
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]"
                onClick={() => handleSort("type")}
              >
                Type{renderSortIndicator("type")}
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]"
                onClick={() => handleSort("title")}
              >
                Title{renderSortIndicator("title")}
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]"
                onClick={() => handleSort("date")}
              >
                {dateColumnLabel}
                {renderSortIndicator("date")}
              </th>
              {isMergedView ? (
                <th
                  scope="col"
                  className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]"
                  onClick={() => handleSort("days")}
                >
                  Days{renderSortIndicator("days")}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)]">
            {sortedAndFilteredPrs.length === 0 ? (
              <tr>
                <td
                  colSpan={tableColumnCount}
                  className="px-6 py-8 text-center text-sm text-[color:var(--muted)]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedAndFilteredPrs.map((pr) => (
                <tr
                  key={pr.id}
                  className="transition-colors duration-200 hover:bg-[color:var(--surface-hover)]"
                >
                  <td className="px-6 py-4 text-sm font-semibold text-[color:var(--foreground)]">
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-500 transition-colors hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300"
                    >
                      #{pr.id}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                        pr.type === "plugin"
                          ? "bg-sky-500/10 text-sky-700 dark:bg-sky-400/20 dark:text-sky-200"
                          : pr.type === "theme"
                          ? "bg-pink-500/10 text-pink-700 dark:bg-pink-400/20 dark:text-pink-200"
                          : "bg-gray-500/10 text-gray-600 dark:bg-gray-400/20 dark:text-gray-200"
                      }`}
                    >
                      {pr.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-[color:var(--muted)]">
                    <span className="block max-w-[320px] truncate">
                      {cleanTitle(pr.title)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-[color:var(--muted)]">
                    {formatRelativeTime(
                      isMergedView
                        ? (pr as MergedPullRequest).mergedAt
                        : pr.createdAt
                    )}
                  </td>
                  {isMergedView ? (
                    <td className="px-6 py-4 text-sm text-[color:var(--muted)]">
                      {(pr as MergedPullRequest).daysToMerge}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default PullRequestTable;
