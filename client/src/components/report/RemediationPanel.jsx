import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import { useRescanMutation } from '../../features/scans/scansApi.js';
import { getErrorMessage } from '../../lib/errors.js';
import { getRemediationPatchViaFirebase } from '../../lib/aiRemediation.js';

// Human-in-the-loop AI fix for one finding: asks Gemini for a patch, shows it
// side by side against the saved snippet, and only on explicit confirmation
// applies it and re-scans. The report view is read-only — applying copies the
// patch for you to paste into your own editor, and re-scanning is only offered
// for reports that can be fetched again (demo and public repos).
export default function RemediationPanel({ reportId, finding, canRescan }) {
  const navigate = useNavigate();
  const [remediating, setRemediating] = useState(false);
  const [rescan, { isLoading: isRescanning }] = useRescanMutation();
  const [patch, setPatch] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  if (!finding.snippet) {
    return <p className="text-xs text-slate-500">No saved code context for this finding, so an AI patch is unavailable.</p>;
  }

  const run = async () => {
    setError('');
    setApplied(false);
    setRemediating(true);
    try {
      // Routed through Firebase AI Logic in the browser — no backend call.
      setPatch(await getRemediationPatchViaFirebase(finding));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRemediating(false);
    }
  };

  const copyPatch = async () => {
    try {
      await navigator.clipboard.writeText(patch.patchedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the patch stays selectable, so copying by hand still works */
    }
  };

  const applyAndRescan = async () => {
    try {
      await navigator.clipboard.writeText(patch.patchedCode);
    } catch {
      /* the patch stays selectable below */
    }
    setApplied(true);
    if (!canRescan) return;
    try {
      const next = await rescan(reportId).unwrap();
      navigate(`/reports/${next._id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const busy = remediating || isRescanning;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-slate-500">AI patch</p>
        {!patch && (
          <button onClick={run} disabled={busy} className="text-xs text-cyan-300 hover:text-cyan-200 disabled:opacity-50">
            {remediating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="mr-1 inline h-3.5 w-3.5" />Fix with AI</>}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-red-400">{error}</p>
          <button onClick={run} className="shrink-0 text-xs text-slate-400 hover:text-slate-200">Try again</button>
        </div>
      )}

      {remediating && !patch && <p className="text-xs text-slate-500">Gemini is writing a patch… this can take up to a minute on large files.</p>}

      {patch && (
        <div>
          {patch.explanation && <p className="mb-2 text-slate-300">{patch.explanation}</p>}
          <div className="overflow-hidden rounded-lg border border-slate-800 text-xs">
            <ReactDiffViewer
              oldValue={finding.snippet}
              newValue={patch.patchedCode}
              splitView
              useDarkTheme
              showDiffOnly={false}
              leftTitle={finding.line ? `${finding.file}:${finding.line}` : finding.file || 'Original'}
              rightTitle="AI patch"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={copyPatch} className="btn-ghost px-3 py-1.5 text-xs">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy patch'}
            </button>
            <button onClick={applyAndRescan} disabled={busy || applied} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
              {isRescanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : applied ? <Check className="h-3.5 w-3.5" /> : null}
              {isRescanning ? 'Re-scanning…' : applied ? 'Applied' : 'Apply fix & re-scan'}
            </button>
            <button onClick={run} disabled={busy} className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50">
              Regenerate
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-600">
            {canRescan
              ? 'Applying copies the patch — paste it into your code, then the scan runs again on the fixed code to confirm.'
              : 'The report is read-only, so applying copies the patch — paste it into your code and scan again to confirm the fix.'}
          </p>
        </div>
      )}
    </div>
  );
}
