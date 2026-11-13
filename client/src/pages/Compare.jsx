import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUp, Loader2 } from 'lucide-react';
import { useGetScanQuery, useGetScansQuery } from '../features/scans/scansApi.js';
import { getErrorMessage } from '../lib/errors.js';
import { formatDate } from '../lib/format.js';
import { compareScans, defaultPair, projectName } from '../lib/compare.js';
import SeverityBadge from '../components/ui/SeverityBadge.jsx';

function FindingRow({ finding }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <SeverityBadge severity={finding.severity} />
      <div className="min-w-0">
        <p className="text-sm text-slate-200">{finding.title}</p>
        {finding.file && <p className="mt-0.5 break-all font-mono text-xs text-slate-500">{finding.file}</p>}
      </div>
    </li>
  );
}

function Group({ title, tone, items, empty }) {
  return (
    <div className="card overflow-hidden">
      <div className={`flex items-center justify-between border-b border-slate-800 px-4 py-3 ${tone}`}>
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-sm font-semibold">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {items.map((f, i) => (
            <FindingRow key={`${f._id || i}`} finding={f} />
          ))}
        </ul>
      )}
    </div>
  );
}

const label = (r) => `${r.name} · ${formatDate(r.completedAt || r.createdAt)} · risk ${r.riskScore}`;

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const { data: reports = [], isLoading } = useGetScansQuery(undefined, { refetchOnMountOrArgChange: true });

  const done = useMemo(
    () =>
      reports
        .filter((r) => r.status === 'completed')
        .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt)),
    [reports]
  );

  const fallback = useMemo(() => defaultPair(reports, params.get('b')), [reports, params]);
  const olderId = params.get('a') || fallback.older;
  const newerId = params.get('b') || fallback.newer;

  const older = useGetScanQuery(olderId, { skip: !olderId });
  const newer = useGetScanQuery(newerId, { skip: !newerId });

  const result = useMemo(
    () => (older.data && newer.data ? compareScans(older.data, newer.data) : null),
    [older.data, newer.data]
  );

  const pick = (key) => (e) => {
    const next = new URLSearchParams(params);
    next.set('a', olderId || '');
    next.set('b', newerId || '');
    next.set(key, e.target.value);
    setParams(next, { replace: true });
  };

  // The history of the project being compared, oldest first.
  const history = useMemo(() => {
    const name = newer.data?.name;
    return done.filter((r) => projectName(r.name) === projectName(name)).reverse();
  }, [done, newer.data]);

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />;

  if (done.length < 2) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-white">Compare scans</h1>
        <p className="mt-3 text-sm text-slate-400">
          You need at least two finished scans to compare. Scan your project again after you fix things, then come back here to see what
          changed.
        </p>
        <Link to="/vault" className="btn-primary mt-5 inline-flex">
          Start a scan
        </Link>
      </div>
    );
  }

  const error = getErrorMessage(older.error) || getErrorMessage(newer.error);
  const better = result && result.scoreChange < 0;
  const worse = result && result.scoreChange > 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Compare scans</h1>
      <p className="mt-1 mb-6 text-sm text-slate-400">See what you fixed, what is new, and what is still open between two scans.</p>

      <div className="card grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <label className="block text-xs font-semibold uppercase text-slate-500">
          Earlier scan
          <select className="input mt-1 normal-case" value={olderId || ''} onChange={pick('a')}>
            {done.map((r) => (
              <option key={r._id} value={r._id}>
                {label(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold uppercase text-slate-500">
          Later scan
          <select className="input mt-1 normal-case" value={newerId || ''} onChange={pick('b')}>
            {done.map((r) => (
              <option key={r._id} value={r._id}>
                {label(r)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {olderId && newerId && olderId === newerId && (
        <p className="mt-4 text-sm text-orange-400">Pick two different scans to see what changed.</p>
      )}

      {!result && !error && <Loader2 className="mt-8 h-6 w-6 animate-spin text-cyan-400" />}

      {result && (
        <div className="mt-6 space-y-4">
          <div
            className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border p-4 ${
              better
                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                : worse
                  ? 'border-red-500/30 bg-red-500/5 text-red-300'
                  : 'border-slate-700 bg-slate-900/50 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 text-lg font-semibold">
              {older.data.riskScore} <ArrowRight className="h-4 w-4" /> {newer.data.riskScore}
              <span className="text-sm font-normal opacity-80">risk score</span>
              {better && <ArrowDown className="h-4 w-4" />}
              {worse && <ArrowUp className="h-4 w-4" />}
            </div>
            <p className="text-sm">
              {better
                ? 'Better. The risk went down.'
                : worse
                  ? 'Worse. The risk went up.'
                  : 'The risk score did not change.'}{' '}
              {result.fixed.length} fixed, {result.added.length} new, {result.remaining.length} still open.
            </p>
          </div>

          <Group title="Fixed since the earlier scan" tone="text-emerald-300" items={result.fixed} empty="Nothing was fixed between these scans." />
          <Group title="New problems" tone="text-red-300" items={result.added} empty="No new problems. Nice." />
          <Group title="Still open" tone="text-slate-200" items={result.remaining} empty="Nothing is left open." />

          <p className="text-xs text-slate-500">
            Findings are matched by their type and file, not their line number, so moving code around does not make a problem look new.
          </p>
        </div>
      )}

      {history.length > 1 && (
        <div className="card mt-8 overflow-hidden">
          <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-200">
            History of &ldquo;{projectName(newer.data.name)}&rdquo;
          </h2>
          <ul className="divide-y divide-slate-800">
            {history.map((r) => (
              <li key={r._id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Link to={`/reports/${r._id}`} className="min-w-0 flex-1 truncate text-slate-300 hover:text-cyan-300">
                  {formatDate(r.completedAt || r.createdAt)}
                </Link>
                <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-slate-800 sm:w-40">
                  <div
                    className={`h-full ${r.riskScore >= 70 ? 'bg-red-500' : r.riskScore >= 40 ? 'bg-orange-500' : 'bg-yellow-500'}`}
                    style={{ width: `${Math.max(3, r.riskScore)}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-slate-400">{r.riskScore}</span>
                <span className="w-16 shrink-0 text-right text-xs text-slate-500">{r.summary?.total ?? 0} found</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
