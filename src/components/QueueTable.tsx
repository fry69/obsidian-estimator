import React, { useState, useMemo } from 'react';
import type { PullRequest } from '../types';

interface QueueTableProps {
  readyForReviewPrs: PullRequest[];
  filterType: 'all' | 'plugin' | 'theme';
  setFilterType: (filter: 'all' | 'plugin' | 'theme') => void;
}

type SortColumn = 'id' | 'type' | 'title' | 'createdAt';
type SortDirection = 'asc' | 'desc';

const cleanTitle = (title: string) => {
  if (title.startsWith('Add plugin: ')) {
    return title.replace('Add plugin: ', '');
  }
  if (title.startsWith('Add theme: ')) {
    return title.replace('Add theme: ', '');
  }
  return title;
};

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  let interval = seconds / 31536000; // years
  if (interval > 1) {
    return Math.floor(interval) + 'y';
  }
  interval = seconds / 2592000; // months
  if (interval > 1) {
    return Math.floor(interval) + 'mo';
  }
  interval = seconds / 604800; // weeks
  if (interval > 1) {
    return Math.floor(interval) + 'w';
  }
  interval = seconds / 86400; // days
  if (interval > 1) {
    return Math.floor(interval) + 'd';
  }
  interval = seconds / 3600; // hours
  if (interval > 1) {
    return Math.floor(interval) + 'h';
  }
  interval = seconds / 60; // minutes
  if (interval > 1) {
    return Math.floor(interval) + 'm';
  }
  return Math.floor(seconds) + 's';
};

const QueueTable: React.FC<QueueTableProps> = ({ readyForReviewPrs, filterType, setFilterType }) => {
  const [sortColumn, setSortColumn] = useState<SortColumn>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedAndFilteredPrs = useMemo(() => {
    const sortablePrs = readyForReviewPrs.filter(pr => {
      if (filterType === 'all') return true;
      return pr.type === filterType;
    });

    sortablePrs.sort((a, b) => {
      let compareValue = 0;
      if (sortColumn === 'id') {
        compareValue = a.id - b.id;
      } else if (sortColumn === 'type') {
        compareValue = a.type.localeCompare(b.type);
      } else if (sortColumn === 'title') {
        compareValue = cleanTitle(a.title).localeCompare(cleanTitle(b.title));
      } else if (sortColumn === 'createdAt') {
        compareValue = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortDirection === 'asc' ? compareValue : -compareValue;
    });
    return sortablePrs;
  }, [readyForReviewPrs, filterType, sortColumn, sortDirection]);

  const renderSortIndicator = (column: SortColumn) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? ' ▲' : ' ▼';
    }
    return '';
  };

  return (
    <section className="bg-white p-6 rounded-xl shadow-lg">
      <div className="flex flex-col md:flex-row justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Current "Ready for review" Queue</h2>
        <div id="queue-filters" className="flex space-x-2 mt-4 md:mt-0" role="group">
          <button
            data-type="all"
            className={`filter-btn px-4 py-2 rounded-md font-semibold shadow ${filterType === 'all' ? 'bg-sky-600 text-white' : 'bg-white text-slate-700'}`}
            onClick={() => setFilterType('all')}
          >
            All
          </button>
          <button
            data-type="plugin"
            className={`filter-btn px-4 py-2 rounded-md font-semibold shadow ${filterType === 'plugin' ? 'bg-sky-600 text-white' : 'bg-white text-slate-700'}`}
            onClick={() => setFilterType('plugin')}
          >
            Plugins
          </button>
          <button
            data-type="theme"
            className={`filter-btn px-4 py-2 rounded-md font-semibold shadow ${filterType === 'theme' ? 'bg-sky-600 text-white' : 'bg-white text-slate-700'}`}
            onClick={() => setFilterType('theme')}
          >
            Themes
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('id')}>PR #{renderSortIndicator('id')}</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('type')}>Type{renderSortIndicator('type')}</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('title')}>Title{renderSortIndicator('title')}</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('createdAt')}>Submitted{renderSortIndicator('createdAt')}</th>
            </tr>
          </thead>
          <tbody id="queue-table-body" className="bg-white divide-y divide-slate-200">
            {sortedAndFilteredPrs.length === 0 ? (
              <tr><td colSpan={4} className="text-center p-8 text-slate-500">The queue is empty!</td></tr>
            ) : (
              sortedAndFilteredPrs.map(pr => (
                <tr key={pr.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:text-sky-800">#{pr.id}</a>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${pr.type === 'plugin' ? 'bg-sky-100 text-sky-800' : 'bg-pink-100 text-pink-800'}`}>
                      {pr.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 truncate" style={{ maxWidth: '300px' }}>{cleanTitle(pr.title)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{formatTimeAgo(pr.createdAt)}</td>
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
