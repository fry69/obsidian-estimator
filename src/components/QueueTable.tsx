import React, { useState, useMemo } from "react";
import type { PullRequest } from "../types";

interface QueueTableProps {
  readyForReviewPrs: PullRequest[];
  filterType: "all" | "plugin" | "theme";
  setFilterType: (filter: "all" | "plugin" | "theme") => void;
}

type SortColumn = "id" | "type" | "title" | "createdAt";
type SortDirection = "asc" | "desc";

const cleanTitle = (title: string) => {
  if (title.startsWith("Add plugin: ")) {
    return title.replace("Add plugin: ", "");
  }
  if (title.startsWith("Add theme: ")) {
    return title.replace("Add theme: ", "");
  }
  return title;
};

const formatTimeAgo = (dateString: string) => {
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

const QueueTable: React.FC<QueueTableProps> = ({
  readyForReviewPrs,
  filterType,
  setFilterType,
}) => {
  const [sortColumn, setSortColumn] = useState<SortColumn>("id");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedAndFilteredPrs = useMemo(() => {
    const sortablePrs = readyForReviewPrs.filter((pr) => {
      if (filterType === "all") return true;
      return pr.type === filterType;
    });

    sortablePrs.sort((a, b) => {
      let compareValue = 0;
      if (sortColumn === "id") {
        compareValue = a.id - b.id;
      } else if (sortColumn === "type") {
        compareValue = a.type.localeCompare(b.type);
      } else if (sortColumn === "title") {
        compareValue = cleanTitle(a.title).localeCompare(cleanTitle(b.title));
      } else if (sortColumn === "createdAt") {
        compareValue =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortDirection === "asc" ? compareValue : -compareValue;
    });
    return sortablePrs;
  }, [readyForReviewPrs, filterType, sortColumn, sortDirection]);

  const renderSortIndicator = (column: SortColumn) => {
    if (sortColumn === column) {
      return sortDirection === "asc" ? " ▲" : " ▼";
    }
    return "";
  };

  const renderButton = (label: string, type: "all" | "plugin" | "theme") => (
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

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-6 shadow-[var(--shadow-soft)] transition-[background-color,border-color,box-shadow] duration-300 sm:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
          Current "Ready for review" Queue
        </h2>
        <div id="queue-filters" className="flex flex-wrap gap-2" role="group">
          {renderButton("All", "all")}
          {renderButton("Plugins", "plugin")}
          {renderButton("Themes", "theme")}
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
                onClick={() => handleSort("createdAt")}
              >
                Submitted{renderSortIndicator("createdAt")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)]">
            {sortedAndFilteredPrs.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-8 text-center text-sm text-[color:var(--muted)]"
                >
                  The queue is empty!
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
                          : "bg-pink-500/10 text-pink-700 dark:bg-pink-400/20 dark:text-pink-200"
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
                    {formatTimeAgo(pr.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default QueueTable;
