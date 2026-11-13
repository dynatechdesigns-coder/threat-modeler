import { useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, Loader2, ShieldQuestion } from 'lucide-react';
import { useCheckHeadersMutation } from '../features/headers/headersApi.js';
import { getErrorMessage } from '../lib/errors.js';

const STATUS = {
  pass: { icon: CheckCircle2, cls: 'text-emerald-400', label: 'Good' },
  warn: { icon: AlertTriangle, cls: 'text-orange-400', label: 'Could be better' },
  fail: { icon: AlertOctagon, cls: 'text-red-400', label: 'Missing or unsafe' },
};

const GRADE_COLOR = {
  A: 'text-emerald-400 ring-emerald-500/40',
  B: 'text-lime-400 ring-lime-500/40',
  C: 'text-yellow-400 ring-yellow-500/40',
  D: 'text-orange-400 ring-orange-500/40',
  F: 'text-red-400 ring-red-500/40',
};

function Check({ check }) {
  const [open, setOpen] = useState(false);
  const s = STATUS[check.status];
  const Icon = s.icon;
  const hasFix = Boolean(check.fix);

  return (
    <li className="px-4 py-3">
      <button
        className="flex w-full items-start gap-3 text-left"
        onClick={() => hasFix && setOpen((o) => !o)}
        aria-expanded={hasFix ? open : undefined}
      >
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.cls}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">
            {check.title} <span className={`ml-1 text-xs font-normal ${s.cls}`}>{s.label}</span>
          </p>
          <p className="mt-0.5 text-sm text-slate-400">{check.detail}</p>
        </div>
        {hasFix && <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && hasFix && (
        <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-black/50 p-3 font-mono text-xs leading-relaxed text-slate-300">
          {check.fix}
        </pre>
      )}
    </li>
  );
}

export default function HeaderChecker() {
  const [url, setUrl] = useState('');
  const [check, { data, isLoading, error, reset }] = useCheckHeadersMutation();

  const submit = (e) => {
    e.preventDefault();
    if (url.trim()) check(url.trim());
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Security Headers</h1>
      <p className="mt-1 mb-6 text-sm text-slate-400">
        Type a website address and get a grade for the security settings it sends to browsers.
      </p>

      <form onSubmit={submit} className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="input"
            placeholder="https://your-site.com"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (data || error) reset();
            }}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="btn-primary shrink-0" disabled={isLoading || !url.trim()}>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLoading ? 'Checking...' : 'Check headers'}
          </button>
        </div>
        <p className="mt-3 flex gap-2 text-xs text-slate-500">
          <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            We make one request to the page and read only its response headers, never its content. Addresses on private or local
            networks are refused. Only check sites you own or have permission to test.
          </span>
        </p>
      </form>

      {error && <p className="mt-4 text-sm text-red-400">{getErrorMessage(error)}</p>}

      {data && (
        <div className="mt-6 space-y-4">
          <div className="card flex flex-wrap items-center gap-5 p-5">
            <div
              className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-5xl font-bold ring-2 ring-inset ${GRADE_COLOR[data.grade]}`}
              aria-label={`Grade ${data.grade}`}
            >
              {data.grade}
            </div>
            <div className="min-w-0">
              <p className="break-all text-sm text-slate-300">{data.finalUrl}</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {data.score}
                <span className="text-sm font-normal text-slate-500">/100</span>
              </p>
              <p className="text-sm text-slate-400">
                {data.summary.pass} good, {data.summary.warn} could be better, {data.summary.fail} missing or unsafe
              </p>
              {data.redirects.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  Followed {data.redirects.length} redirect{data.redirects.length === 1 ? '' : 's'} to get here.
                </p>
              )}
            </div>
          </div>

          <div className="card overflow-hidden">
            <ul className="divide-y divide-slate-800">
              {data.checks.map((c) => (
                <Check key={c.id} check={c} />
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-500">
            Tap a check that is not green to see a fix you can paste into nginx or Express. Headers are one layer of protection, not
            a full security test.
          </p>
        </div>
      )}
    </div>
  );
}
