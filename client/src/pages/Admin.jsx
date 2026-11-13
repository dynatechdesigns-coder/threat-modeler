import { Loader2 } from 'lucide-react';
import { useGetAdminStatsQuery } from '../features/admin/adminApi.js';
import { getErrorMessage } from '../lib/errors.js';
import { formatDate } from '../lib/format.js';

function Stat({ label, value, hint }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value ?? 0}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function Admin() {
  const { data, error, isLoading } = useGetAdminStatsQuery();

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />;
  if (error) return <p className="text-sm text-red-400">{getErrorMessage(error)}</p>;

  const s = data.scans.byStatus || {};
  const max = Math.max(1, ...data.topCategories.map((c) => c.count));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Admin</h1>
      <p className="mt-1 text-sm text-slate-400">How the app is being used. Only counts: no code or findings are shown here.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="People signed up" value={data.users.total} hint={`${data.users.lastWeek} in the last 7 days`} />
        <Stat label="Confirmed emails" value={data.users.verified} />
        <Stat label="Scans, all time" value={data.scans.total} hint={`${data.scans.last24h} today · ${data.scans.lastWeek} this week`} />
        <Stat label="Scans failed" value={s.failed} hint={`${s.completed || 0} completed · ${s.running || 0} running`} />
        <Stat label="Watched repos" value={data.watchedRepos} />
        <Stat label="Shared report links" value={data.sharedReports} />
        <Stat label="Waitlist signups" value={data.waitlist?.total} hint={`${data.waitlist?.lastWeek || 0} in the last 7 days`} />
      </div>

      <div className="card mt-8 p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-200">Latest waitlist signups</h2>
        {!data.waitlist?.recent?.length ? (
          <p className="text-sm text-slate-500">No one has joined yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {data.waitlist.recent.map((w) => (
              <li key={w.email} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="text-slate-200">{w.email}</span>
                <span className="text-xs text-slate-500">{formatDate(w.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Most common problems found (30 days)</h2>
          {data.topCategories.length === 0 ? (
            <p className="text-sm text-slate-500">No completed scans yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.topCategories.map((c) => (
                <li key={c.category}>
                  <div className="flex justify-between text-sm text-slate-300">
                    <span>{c.category}</span>
                    <span className="text-slate-400">{c.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-800">
                    <div className="h-1.5 rounded-full bg-cyan-500" style={{ width: `${(c.count / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Recent failed scans</h2>
          {data.failedRecent.length === 0 ? (
            <p className="text-sm text-slate-500">None. Nice.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {data.failedRecent.map((f, i) => (
                <li key={i} className="py-2 text-sm">
                  <p className="text-slate-200">{f.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(f.at)} · {f.error || 'No reason recorded'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
