import React from 'react';
import type { PullRequest } from '../types';

interface QueueTableProps {
  readyForReviewPrs: PullRequest[];
}

const QueueTable: React.FC<QueueTableProps> = ({ readyForReviewPrs }) => {
  return (
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
  );
};

export default QueueTable;
