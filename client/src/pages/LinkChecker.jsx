import { useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Loader2, ShieldQuestion } from 'lucide-react';
import { useCheckLinksMutation } from '../features/links/linksApi.js';
import { getErrorMessage } from '../lib/errors.js';
import { analyzeText, summarize } from '../lib/links/analyze.js';

const MAX = 10000;

// Made-up addresses. They are only ever shown as text and checked by pattern. Nothing is opened.
const EXAMPLE =
  'URGENT: your account will be suspended within 24 hours! Verify now at http://secure-paypal-login.example/verify-account ' +
  'and send your OTP to claim your free gift. Our docs are at https://github.com/features.';

const VERDICTS = {
  dangerous: {
    label: 'Dangerous',
    badge: 'bg-red-500/10 text-red-400 ring-red-500/30',
    icon: AlertOctagon,
    banner: 'border-red-500/30 bg-red-500/5 text-red-300',
    headline: 'This looks dangerous. Do not open the links or reply.',
  },
  suspicious: {
    label: 'Suspicious',
    badge: 'bg-orange-500/10 text-orange-400 ring-orange-500/30',
    icon: AlertTriangle,
    banner: 'border-orange-500/30 bg-orange-500/5 text-orange-300',
    headline: 'This looks suspicious. Be careful and check it another way first.',
  },
  ok: {
    label: 'No red flags',
    badge: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
    icon: CheckCircle2,
    banner: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
    headline: 'No red flags found. That is not a guarantee, so stay careful.',
  },
};

const LEVEL_DOT = { danger: 'bg-red-400', warn: 'bg-orange-400', info: 'bg-slate-500' };

function VerdictBadge({ verdict }) {
  const v = VERDICTS[verdict] || VERDICTS.ok;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${v.badge}`}>
      {v.label}
    </span>
  );
}

function UrlCard({ item }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        {/* Shown as plain text on purpose, so nobody opens a dangerous link by tapping it. */}
        <code className="min-w-0 break-all text-sm text-slate-200">{item.url}</code>
        <VerdictBadge verdict={item.verdict} />
      </div>

      {item.reasons.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {item.reasons.map((r, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-slate-300">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[r.level] || LEVEL_DOT.info}`} />
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-400">Nothing unusual in how this link is written.</p>
      )}

      <p className="mt-3 text-xs text-slate-500">Checked with: {item.sources.join(', ')}</p>
    </div>
  );
}

export default function LinkChecker() {
  const [text, setText] = useState('');
  const [check, { data: serverData, isLoading, error, reset }] = useCheckLinksMutation();
  // Used when the server cannot be reached (no internet, or the server is asleep). The same checks run on this device.
  const [localData, setLocalData] = useState(null);
  const data = localData || serverData;

  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setLocalData(null);

    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (!offline) {
      const res = await check(value);
      if (!res.error || res.error.status !== 'FETCH_ERROR') return;
    }
    setLocalData(summarize(analyzeText(value)));
  };

  const clear = () => {
    setText('');
    setLocalData(null);
    reset();
  };

  const overall = data ? VERDICTS[data.overall] || VERDICTS.ok : null;
  const OverallIcon = overall?.icon;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Link Checker</h1>
      <p className="mt-1 mb-6 text-sm text-slate-400">
        Paste a link, or a whole message, and see whether it looks dangerous or like spam.
      </p>

      <form onSubmit={submit} className="card p-4 sm:p-5">
        <textarea
          className="input min-h-[140px] resize-y font-mono"
          placeholder="Paste a link or a message here..."
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={isLoading || !text.trim()}>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            Check
          </button>
          <button type="button" className="btn-ghost" onClick={() => setText(EXAMPLE)}>
            Try an example
          </button>
          {(text || data) && (
            <button type="button" className="text-sm text-slate-400 hover:text-slate-200" onClick={clear}>
              Clear
            </button>
          )}
          <span className="ml-auto text-xs text-slate-500">
            {text.length.toLocaleString()} / {MAX.toLocaleString()}
          </span>
        </div>
        <p className="mt-3 flex gap-2 text-xs text-slate-500">
          <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            We never open the links, and nothing you paste is saved. The result comes from how each link is written and
            how the message is worded, plus Google's list of dangerous sites when it is switched on for this server.
          </span>
        </p>
      </form>

      {error && !localData && <p className="mt-4 text-sm text-red-400">{getErrorMessage(error)}</p>}

      {data && (
        <div className="mt-6 space-y-4">
          <div className={`flex items-start gap-3 rounded-xl border p-4 ${overall.banner}`}>
            <OverallIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">{overall.headline}</p>
              <p className="mt-1 text-sm opacity-80">
                {data.urls.length === 0
                  ? 'No links were found in what you pasted.'
                  : `${data.urls.length} link${data.urls.length === 1 ? '' : 's'} checked: ${data.summary.dangerous} dangerous, ${data.summary.suspicious} suspicious, ${data.summary.ok} with no red flags.`}
              </p>
            </div>
          </div>

          {data.message.reasons.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-200">The message itself</h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                    data.message.verdict === 'spam' ? VERDICTS.dangerous.badge : VERDICTS.suspicious.badge
                  }`}
                >
                  {data.message.verdict === 'spam' ? 'Likely scam or spam' : 'Some warning signs'}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {data.message.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.urls.map((item, i) => (
            <UrlCard key={`${item.url}-${i}`} item={item} />
          ))}

          {localData && (
            <p className="text-xs text-slate-500">
              Checked on this device without the server, so Google's list of dangerous sites was not used.
            </p>
          )}

          {data.notes.length > 0 && (
            <ul className="space-y-1 text-xs text-slate-500">
              {data.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
