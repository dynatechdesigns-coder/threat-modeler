import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, FolderOpen } from 'lucide-react';
import { useGetScansQuery } from '../features/scans/scansApi.js';
import { getErrorMessage } from '../lib/errors.js';
import { formatDate } from '../lib/format.js';
import StatCard from '../components/ui/StatCard.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import RiskTrend from '../components/charts/RiskTrend.jsx';
import GettingStarted from '../components/dashboard/GettingStarted.jsx';

export default function Dashboard() {
  // refetchOnMountOrArgChange keeps statuses fresh after a scan finishes elsewhere.
  const { data: reports = [], isLoading, error } = useGetScansQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  const completed = reports.filter((r) => r.status === 'completed');
  const totalFindings = completed.reduce((n, r) => n + (r.summary?.total || 0), 0);
  const critical = completed.reduce((n, r) => n + (r.summary?.critical || 0), 0);
  const running = reports.filter((r) => r.status === 'running').length;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">Overview of your scans and findings.</p>
        </div>
        <Link to="/vault" className="btn-primary">New scan</Link>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{getErrorMessage(error)}</p>}

      {!isLoading && !error && <GettingStarted reports={reports} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total scans" value={reports.length} icon={FolderOpen} />
        <StatCard label="Running now" value={running} icon={Activity} />
        <StatCard label="Total findings" value={totalFindings} icon={CheckCircle2} />
        <StatCard label="Critical findings" value={critical} icon={AlertTriangle} />
      </div>

      <RiskTrend reports={reports} />

      <div className="card mt-8">
        <div className="border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-200">Recent scans</h2>
        </div>
        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">Loading...</p>
        ) : reports.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No scans yet. Upload code in the Code Vault to get started.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {reports.slice(0, 6).map((r) => (
              <li key={r._id}>
                <Link
                  to={r.status === 'completed' ? `/reports/${r._id}` : `/scans/${r._id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-slate-900"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-200">{r.name}</p>
                    <p className="text-xs text-slate-500">{formatDate(r.createdAt)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
