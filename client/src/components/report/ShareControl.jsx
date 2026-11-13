import { useState } from 'react';
import { Check, Copy, Link2, Loader2 } from 'lucide-react';
import { useDisableShareMutation, useEnableShareMutation } from '../../features/scans/scansApi.js';
import { getErrorMessage } from '../../lib/errors.js';

// Turns the public read-only link for a report on or off.
export default function ShareControl({ report }) {
  const [enable, { isLoading: enabling }] = useEnableShareMutation();
  const [disable, { isLoading: disabling }] = useDisableShareMutation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const link = report.shareToken ? `${window.location.origin}/r/${report.shareToken}` : '';
  const busy = enabling || disabling;

  const turnOn = async () => {
    setError('');
    try {
      await enable(report._id).unwrap();
      setOpen(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const turnOff = async () => {
    if (!window.confirm('Switch the link off? Anyone who has it will no longer be able to open the report.')) return;
    setError('');
    try {
      await disable(report._id).unwrap();
      setOpen(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the link is selectable in the box, so copying by hand still works */
    }
  };

  return (
    <div className="relative">
      <button className="btn-ghost" onClick={() => (report.shareToken ? setOpen((o) => !o) : turnOn())} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
        {report.shareToken ? 'Shared' : 'Share'}
      </button>

      {error && <p className="absolute right-0 mt-2 w-64 text-xs text-red-400">{error}</p>}

      {open && report.shareToken && (
        <div className="card absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] p-4 shadow-xl">
          <p className="text-sm font-medium text-slate-200">Anyone with this link can read this report</p>
          <p className="mt-1 text-xs text-slate-500">
            They do not need an account and cannot change anything. They see the findings, short code snippets and the
            summary, but not your uploaded files or scan log.
          </p>
          <div className="mt-3 flex gap-2">
            <input className="input text-xs" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn-ghost shrink-0" onClick={copy} aria-label="Copy link">
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button className="text-xs text-red-400 hover:text-red-300" onClick={turnOff} disabled={busy}>
              Switch link off
            </button>
            <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
