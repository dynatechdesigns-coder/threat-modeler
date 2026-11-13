import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Check, Copy, Eye, GitCompare, Loader2, Trash2 } from 'lucide-react';
import { selectCurrentUser } from '../features/auth/authSlice.js';
import { useUpdatePreferencesMutation } from '../features/auth/authApi.js';
import {
  useCreateWatchMutation,
  useDeleteWatchMutation,
  useDisableBadgeMutation,
  useEnableBadgeMutation,
  useGetBadgeQuery,
  useGetWatchesQuery,
  useLazyGetWatchSetupQuery,
} from '../features/scans/watchApi.js';
import { getErrorMessage } from '../lib/errors.js';
import { formatDate } from '../lib/format.js';

const EVENT_STYLE = {
  scanning: { label: 'Scanning...', cls: 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/30' },
  baseline: { label: 'First scan', cls: 'bg-slate-500/10 text-slate-300 ring-slate-500/30' },
  ok: { label: 'No new problems', cls: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' },
  warning: { label: 'New problems', cls: 'bg-red-500/10 text-red-300 ring-red-500/30' },
  failed: { label: 'Failed', cls: 'bg-orange-500/10 text-orange-300 ring-orange-500/30' },
  skipped: { label: 'Skipped', cls: 'bg-slate-500/10 text-slate-400 ring-slate-500/30' },
};

function Pill({ status }) {
  const s = EVENT_STYLE[status] || EVENT_STYLE.skipped;
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}>
      {s.label}
    </span>
  );
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the text can still be selected by hand */
    }
  };
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{label}</p>
      <div className="flex gap-2">
        <input className="input font-mono text-xs" readOnly value={value} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn-ghost shrink-0" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function SetupPanel({ repo, setup, onClose }) {
  return (
    <div className="mt-4 space-y-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-slate-300">
      <p className="font-medium text-slate-100">Connect {repo} to GitHub (one time, about 2 minutes)</p>
      <ol className="list-decimal space-y-1 pl-5 text-slate-400">
        <li>On GitHub, open the repository, then Settings, then Webhooks, then Add webhook.</li>
        <li>Paste the Payload URL and the Secret from below.</li>
        <li>
          Set Content type to <span className="text-slate-200">application/json</span>.
        </li>
        <li>
          Choose &ldquo;Just the push event&rdquo; and click Add webhook. A green tick means it is connected.
        </li>
      </ol>
      <CopyField label="Payload URL" value={setup.url} />
      <CopyField label="Secret" value={setup.secret} />
      <p className="text-xs text-slate-500">
        Keep the secret private. It is how we know a request really came from GitHub. If the first delivery fails because the
        server was asleep, open the webhook on GitHub and press Redeliver.
      </p>
      <button className="text-xs text-slate-400 hover:text-slate-200" onClick={onClose}>
        Hide
      </button>
    </div>
  );
}

function EventRow({ ev }) {
  const detail =
    ev.status === 'warning'
      ? `${ev.newCount} new problem${ev.newCount === 1 ? '' : 's'}${ev.newSevere ? `, ${ev.newSevere} serious` : ''}`
      : ev.status === 'ok'
        ? ev.fixedCount
          ? `${ev.fixedCount} fixed`
          : 'Nothing new'
        : ev.reason || '';

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Pill status={ev.status} />
        <code className="text-xs text-slate-400">{ev.sha.slice(0, 7)}</code>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{ev.message || 'Push'}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>{formatDate(ev.at)}</span>
        {ev.author && <span>{ev.author}</span>}
        {detail && <span className={ev.status === 'warning' ? 'text-red-300' : ''}>{detail}</span>}
        {ev.report && ev.status !== 'failed' && ev.status !== 'skipped' && (
          <Link className="text-cyan-300 hover:underline" to={ev.status === 'scanning' ? `/scans/${ev.report}` : `/reports/${ev.report}`}>
            Open report
          </Link>
        )}
        {ev.report && ev.previousReport && (
          <Link className="inline-flex items-center gap-1 text-cyan-300 hover:underline" to={`/compare?a=${ev.previousReport}&b=${ev.report}`}>
            <GitCompare className="h-3 w-3" /> Compare
          </Link>
        )}
      </div>
      {ev.status === 'warning' && ev.newTitles?.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-red-200/80">
          {ev.newTitles.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Switch a public README badge on or off, and copy the line to paste into the README.
function BadgePanel({ watch }) {
  const { data: badge } = useGetBadgeQuery(watch._id, { skip: !watch.badgeOn });
  const [enable, enabling] = useEnableBadgeMutation();
  const [disable, disabling] = useDisableBadgeMutation();
  const [open, setOpen] = useState(false);
  const busy = enabling.isLoading || disabling.isLoading;

  if (!open && !watch.badgeOn) {
    return (
      <button className="mt-3 text-xs text-slate-400 hover:text-cyan-300" onClick={() => setOpen(true)}>
        Add a risk badge to your README
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm">
      {!watch.badgeOn ? (
        <>
          <p className="text-slate-300">
            A small image that shows this repository's latest risk score. Anyone who sees your README can see that one number, and nothing else.
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => enable(watch._id)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Switch badge on
            </button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : badge ? (
        <>
          <p className="mb-2 text-slate-300">Paste this into your README.md. The number updates after every push.</p>
          <img src={badge.image} alt="Threat Modeler risk badge" className="mb-3 h-5" />
          <CopyField label="README line (Markdown)" value={badge.markdown} />
          <button className="mt-3 text-xs text-slate-400 hover:text-red-400" disabled={busy} onClick={() => disable(watch._id)}>
            Switch badge off (the image will show "not found")
          </button>
        </>
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
      )}
    </div>
  );
}

function RepoCard({ watch, onRemove }) {
  const [loadSetup, { isFetching }] = useLazyGetWatchSetupQuery();
  const [setup, setSetup] = useState(null);
  const events = [...(watch.events || [])].reverse().slice(0, 8);
  const latest = events[0];

  const showSetup = async () => {
    const res = await loadSetup(watch._id).unwrap().catch(() => null);
    if (res) setSetup(res);
  };

  return (
    <div className="card overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-white">
              {watch.owner}/{watch.repo}
            </p>
            <p className="text-xs text-slate-500">Branch: {watch.branch || 'default branch'}</p>
          </div>
          <div className="flex items-center gap-3">
            {latest ? <Pill status={latest.status} /> : <span className="text-xs text-slate-500">Waiting for the first push</span>}
            <button className="btn-ghost" onClick={showSetup} disabled={isFetching}>
              {isFetching && <Loader2 className="h-4 w-4 animate-spin" />} Setup
            </button>
            <button onClick={() => onRemove(watch)} aria-label={`Stop watching ${watch.repo}`} className="rounded-lg p-2 hover:bg-slate-800">
              <Trash2 className="h-4 w-4 text-slate-500 hover:text-red-400" />
            </button>
          </div>
        </div>
        <BadgePanel watch={watch} />
        {setup && <SetupPanel repo={`${watch.owner}/${watch.repo}`} setup={setup} onClose={() => setSetup(null)} />}
      </div>
      {events.length > 0 && <ul className="divide-y divide-slate-800 border-t border-slate-800">{events.map((ev) => <EventRow key={ev._id} ev={ev} />)}</ul>}
    </div>
  );
}

function AlertsToggle() {
  const user = useSelector(selectCurrentUser);
  const [update, { isLoading }] = useUpdatePreferencesMutation();
  if (!user?.emailAvailable) return null;

  const verified = user.emailVerified === true;
  return (
    <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-slate-300">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-cyan-500"
        checked={verified && user.emailAlerts !== false}
        disabled={!verified || isLoading}
        onChange={(e) => update({ emailAlerts: e.target.checked })}
      />
      <span>
        Email me when a push adds new problems
        {!verified && <span className="block text-xs text-slate-500">Confirm your email address first, then you can turn this on.</span>}
      </span>
    </label>
  );
}

export default function WatchedRepos() {
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState(null); // setup details of the repository that was just added

  const [pollMs, setPollMs] = useState(0);
  const { data: watches = [], isLoading, error: loadError } = useGetWatchesQuery(undefined, {
    refetchOnMountOrArgChange: true,
    pollingInterval: pollMs, // checks again every 5 seconds while a push scan is running
  });
  const scanning = watches.some((w) => w.events?.some((e) => e.status === 'scanning'));
  const wanted = scanning ? 5000 : 0;
  if (wanted !== pollMs) setPollMs(wanted);

  const [createWatch, { isLoading: creating }] = useCreateWatchMutation();
  const [deleteWatch] = useDeleteWatchMutation();

  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await createWatch({ url: url.trim(), branch: branch.trim() }).unwrap();
      setFresh({ repo: `${res.watch.owner}/${res.watch.repo}`, setup: res.setup });
      setUrl('');
      setBranch('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const remove = async (w) => {
    if (!window.confirm(`Stop watching ${w.owner}/${w.repo}? Remember to delete the webhook on GitHub too.`)) return;
    setError('');
    try {
      await deleteWatch(w._id).unwrap();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Watched repos</h1>
      <p className="mt-1 mb-6 text-sm text-slate-400">
        Scan a public GitHub repository every time someone pushes to it, and get warned when a change adds a problem.
      </p>

      <form onSubmit={add} className="card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Eye className="h-4 w-4 text-cyan-400" /> Watch a repository
        </h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            className="input"
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={creating}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <input
            className="input sm:w-48"
            placeholder="Branch (optional)"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            disabled={creating}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button className="btn-primary shrink-0" disabled={creating || !url.trim()}>
            {creating && <Loader2 className="h-4 w-4 animate-spin" />} Watch
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Public repositories only, up to 3. Leave the branch empty to follow the main branch. Each push is scanned like a
          normal scan, so it uses your scan allowance.
        </p>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <AlertsToggle />
        {fresh && <SetupPanel repo={fresh.repo} setup={fresh.setup} onClose={() => setFresh(null)} />}
      </form>

      {getErrorMessage(loadError) && <p className="mt-4 text-sm text-red-400">{getErrorMessage(loadError)}</p>}

      <div className="mt-6 space-y-4">
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        ) : watches.length === 0 ? (
          <p className="text-sm text-slate-500">You are not watching any repository yet.</p>
        ) : (
          watches.map((w) => <RepoCard key={w._id} watch={w} onRemove={remove} />)
        )}
      </div>
    </div>
  );
}
