import { useMemo, useState } from 'react';
import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import { useRemediateMutation } from '../../features/scans/scansApi.js';
import { getErrorMessage } from '../../lib/errors.js';
import { diffLines } from '../../lib/diff.js';

// Human-in-the-loop AI fix for one finding: asks Gemini for a patch, shows it
// as a diff against the saved snippet, and only on explicit confirmation
// copies it out. The report view is read-only — applying means copying the
// patch to paste into your own editor, never an automatic file change.
export default function RemediationPanel({ reportId, finding }) {
  const [remediate, { isLoading }] = useRemediateMutation();
  const [patch, setPatch] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const rows = useMemo(
    () => (patch ? diffLines(finding.snippet, patch.patchedCode) : []),
    [patch, finding.snippet]
  );
  const added = rows.filter((r) => r.type === 'add').length;
  const removed = rows.filter((r) => r.type === 'del').length;

  if (!finding.snippet) {
    return <p className="text-xs text-slate-500">No saved code context for this finding, so an AI patch is unavailable.</p>;
  }

  const run = async () => {
    setError('');
    setApplied(false);
    try {
      const out = await remediate({ id: reportId, findingId: finding._id }).unwrap();
      setPatch(out);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const copyPatch = async () => {
    try {
      await navigator.clipboard.writeText(patch.patchedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      return true;
    } catch {
      return false; /* the patch stays selectable, so copying by hand still works */
    }
  };

  const apply = async () => {
    await copyPatch();
    setApplied(true);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-slate-500">AI patch</p>
        {!patch && (
          <button onClick={run} disabled={isLoading} className="text-xs text-cyan-300 hover:text-cyan-200 disabled:opacity-50">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="mr-1 inline h-3.5 w-3.5" />Fix with AI</>}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-red-400">{error}</p>
          <button onClick={run} className="shrink-0 text-xs text-slate-400 hover:text-slate-200">Try again</button>
        </div>
      )}

      {isLoading && !patch && <p className="text-xs text-slate-500">Gemini is writing a patch… this can take up to a minute on large files.</p>}

      {patch && (
        <div>
          {patch.explanation && <p className="mb-2 text-slate-300">{patch.explanation}</p>}
          <p className="mb-1 font-mono text-[11px] text-slate-500">
            {finding.file}{finding.line ? `:${finding.line}` : ''} · <span className="text-emerald-300">+{added}</span> <span className="text-red-300">−{removed}</span>
          </p>
          <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-black/50 p-3 font-mono text-xs leading-relaxed">
            {rows.map((r, i) => (
              <span
                key={i}
                className={`block px-2 ${
                  r.type === 'add' ? 'bg-emerald-500/10 text-emerald-200' : r.type === 'del' ? 'bg-red-500/10 text-red-200' : 'text-slate-400'
                }`}
              >
                <span className="mr-2 select-none opacity-60">{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '}</span>
                {r.text || ' '}
              </span>
            ))}
          </pre>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={copyPatch} className="btn-ghost px-3 py-1.5 text-xs">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy patch'}
            </button>
            <button
              onClick={apply}
              disabled={applied}
              className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {applied ? <><Check className="h-3.5 w-3.5" /> Applied — paste it into your code</> : 'Apply fix'}
            </button>
            <button onClick={run} disabled={isLoading} className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50">
              Regenerate
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-600">
            The report is read-only, so applying copies the patch — paste it into {finding.file}{finding.line ? ` around line ${finding.line}` : ''} and re-run your tests.
          </p>
        </div>
      )}
    </div>
  );
}
