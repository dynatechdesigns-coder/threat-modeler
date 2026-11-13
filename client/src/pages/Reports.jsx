import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useDeleteScanMutation, useGetScansQuery } from '../features/scans/scansApi.js';
import { getErrorMessage } from '../lib/errors.js';
import { formatDate } from '../lib/format.js';
import StatusBadge from '../components/ui/StatusBadge.jsx';

export default function Reports() {
  const {
    data: reports = [],
    isLoading,
    error: loadError,
  } = useGetScansQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const [deleteScan] = useDeleteScanMutation();
  const [deleteError, setDeleteError] = useState('');

  const remove = async (id) => {
    if (!window.confirm('Delete this report and its uploaded files?')) return;
    setDeleteError('');
    try {
      // The list refreshes by itself: deleteScan invalidates the Scan tags.
      await deleteScan(id).unwrap();
    } catch (err) {
      setDeleteError(getErrorMessage(err));
    }
  };

  const error = getErrorMessage(loadError) || deleteError;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Reports</h1>
      <p className="mt-1 mb-8 text-sm text-slate-400">All of your scans and their results.</p>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="card overflow-hidden">
        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">Loading...</p>
        ) : reports.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Nothing here yet.</p>
        ) : (
          <>
            {/* Phones: one card-like row per report, so nothing is squeezed or pushed off the screen. */}
            <ul className="divide-y divide-slate-800 sm:hidden">
              {reports.map((r) => (
                <li key={r._id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      className="block truncate text-sm font-medium text-slate-200 hover:text-cyan-300"
                      to={r.status === 'completed' ? `/reports/${r._id}` : `/scans/${r._id}`}
                    >
                      {r.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(r.createdAt)}
                      {r.status === 'completed'
                        ? ` · ${r.summary?.total ?? 0} finding${r.summary?.total === 1 ? '' : 's'}`
                        : ''}
                    </p>
                    <div className="mt-2">
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                  <button
                    onClick={() => remove(r._id)}
                    aria-label="Delete report"
                    className="shrink-0 rounded-lg p-2 hover:bg-slate-800"
                  >
                    <Trash2 className="h-4 w-4 text-slate-500 hover:text-red-400" />
                  </button>
                </li>
              ))}
            </ul>

            <table className="hidden w-full text-left text-sm sm:table">
              <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="hidden px-5 py-3 sm:table-cell">Created</th>
                  <th className="px-5 py-3">Findings</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {reports.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-900">
                    <td className="px-5 py-3">
                      <Link
                        className="font-medium text-slate-200 hover:text-cyan-300"
                        to={r.status === 'completed' ? `/reports/${r._id}` : `/scans/${r._id}`}
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="hidden px-5 py-3 text-slate-400 sm:table-cell">{formatDate(r.createdAt)}</td>
                    <td className="px-5 py-3 text-slate-300">
                      {r.status === 'completed' ? (r.summary?.total ?? 0) : '-'}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => remove(r._id)} aria-label="Delete report">
                        <Trash2 className="h-4 w-4 text-slate-500 hover:text-red-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
