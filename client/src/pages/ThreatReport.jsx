import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, Download, GitCompare, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useGetScanQuery, useGetSharedReportQuery, useRescanMutation } from '../features/scans/scansApi.js';
import ShareControl from '../components/report/ShareControl.jsx';
import RemediationPanel from '../components/report/RemediationPanel.jsx';
import { getErrorMessage } from '../lib/errors.js';
import { formatDate } from '../lib/format.js';
import { sampleReport } from '../data/sampleReport.js';
import { SEVERITIES, SEVERITY_META } from '../lib/severity.js';
import { suggestFix } from '../lib/fixes.js';
import { downloadReportPdf } from '../lib/pdf.js';
import SeverityBadge from '../components/ui/SeverityBadge.jsx';
import SeverityChart from '../components/charts/SeverityChart.jsx';
import ArchitectureGraph from '../components/architecture/ArchitectureGraph.jsx';
import { buildArchitecture } from '../lib/architecture.js';

function FixBlock({ fix }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fix.good);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* copying is optional */
    }
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-slate-500">Suggested fix</p>
        <button onClick={copy} className="text-xs text-slate-400 hover:text-cyan-300">
          {copied ? 'Copied' : 'Copy fixed code'}
        </button>
      </div>
      <p className="mb-2 text-slate-300">{fix.note}</p>
      {fix.bad && (
        <pre className="overflow-x-auto rounded-t-lg border border-red-500/20 bg-red-500/5 p-3 font-mono text-xs leading-relaxed text-red-200">
          <span className="select-none text-red-400">- </span>
          {fix.bad.split('\n').join('\n  ')}
        </pre>
      )}
      <pre
        className={`overflow-x-auto border border-emerald-500/20 bg-emerald-500/5 p-3 font-mono text-xs leading-relaxed text-emerald-200 ${
          fix.bad ? 'rounded-b-lg border-t-0' : 'rounded-lg'
        }`}
      >
        {fix.good}
      </pre>
      <p className="mt-2 text-xs text-slate-500">An example to adapt to your code, not a patch to paste in blindly.</p>
    </div>
  );
}

function FindingCard({ finding, reportId, showRemediate }) {
  const [open, setOpen] = useState(false);
  const fix = useMemo(() => suggestFix(finding), [finding]);

  return (
    <div className="card">
      <button
        className="flex w-full items-start justify-between gap-4 p-4 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <span className="text-xs text-slate-500">{finding.category}</span>
            {finding.cwe && <span className="text-xs text-slate-500">{finding.cwe}</span>}
            {finding.source && (
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {{ rule: 'Rule', ai: 'AI review', osv: 'Dependency' }[finding.source] || finding.source}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-medium text-slate-100">{finding.title}</p>
          {finding.file && (
            <p className="mt-1 font-mono text-xs text-slate-500">
              {finding.file}
              {finding.line ? `:${finding.line}` : ''}
            </p>
          )}
        </div>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-800 p-4 text-sm">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Description</p>
            <p className="text-slate-300">{finding.description}</p>
          </div>
          {finding.snippet && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Code</p>
              <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-black/50 p-3 font-mono text-xs leading-relaxed text-slate-300">
                {finding.snippet}
              </pre>
            </div>
          )}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Recommendation</p>
            <p className="text-slate-300">{finding.recommendation}</p>
          </div>
          {showRemediate && <RemediationPanel reportId={reportId} finding={finding} />}
          {fix && <FixBlock fix={fix} />}
        </div>
      )}
    </div>
  );
}

function AiSummary({ summary }) {
  const isAi = summary.source === 'ai';
  const priorities = summary.priorities || [];

  return (
    <div className="card mt-4 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          {isAi ? 'AI summary and recommendations' : 'Summary and recommendations'}
        </h2>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {isAi ? 'AI-generated' : 'Automatic summary'}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-slate-300">{summary.text}</p>

      {priorities.length > 0 && (
        <div className="mt-5">
          <p className="mb-3 text-xs font-semibold uppercase text-slate-500">Fix these first</p>
          <ol className="space-y-3">
            {priorities.map((p, i) => (
              <li key={i} className="flex gap-3 rounded-lg border border-slate-800 bg-black/20 p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-xs font-semibold text-cyan-300">
                  {i + 1}
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-slate-100">{p.title}</p>
                  {p.why && <p className="mt-0.5 text-slate-400">{p.why}</p>}
                  <p className="mt-1.5 text-slate-300">
                    <span className="font-medium text-cyan-300">Do this: </span>
                    {p.action}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {isAi && (
        <p className="mt-4 text-xs text-slate-500">
          Written by an AI model from the findings below. Double-check before acting on it.
        </p>
      )}
    </div>
  );
}

// `shared` is the public read-only page opened from a share link (/r/:token). Nobody needs to sign in for it.
export default function ThreatReport({ shared = false }) {
  const { id, token } = useParams();
  const isDemo = !shared && id === 'demo';
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();
  const [rescan, rescanState] = useRescanMutation();
  const [rescanError, setRescanError] = useState('');

  // The demo route needs no backend, so the query is skipped for it.
  const owned = useGetScanQuery(id, { skip: isDemo || shared });
  const sharedQuery = useGetSharedReportQuery(token, { skip: !shared });
  const { data, error } = shared ? sharedQuery : owned;
  const report = isDemo ? sampleReport : data;

  const findings = useMemo(() => {
    if (!report) return [];
    const order = (s) => SEVERITIES.indexOf(s);
    return [...report.findings]
      .filter((f) => filter === 'all' || f.severity === filter)
      .sort((a, b) => order(a.severity) - order(b.severity));
  }, [report, filter]);

  // Follows the severity filter above, so the map always matches the visible list.
  // Kept above the early returns: hooks must run in the same order every render.
  const graph = useMemo(() => buildArchitecture(findings), [findings]);

  if (error) return <p className="text-sm text-red-400">{getErrorMessage(error)}</p>;
  if (!report) return <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />;

  // Only the demo and public repositories can be fetched again; uploads are deleted after the scan.
  const canRescan =
    !isDemo && !shared && (report.origin?.kind === 'demo' || (report.origin?.kind === 'github' && !report.origin.private));
  const runRescan = async () => {
    setRescanError('');
    try {
      const next = await rescan(report._id).unwrap();
      navigate(`/reports/${next._id}`);
    } catch (err) {
      setRescanError(getErrorMessage(err));
    }
  };

  const riskColor =
    report.riskScore >= 70 ? 'text-red-400' : report.riskScore >= 40 ? 'text-orange-400' : 'text-yellow-400';

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Threat Report</h1>
          <p className="mt-1 text-sm text-slate-400">
            {report.name}
            {report.completedAt ? ` · ${formatDate(report.completedAt)}` : ''}
          </p>
          {rescanError && <p className="mt-1 text-xs text-red-400">{rescanError}</p>}
          {isDemo && <p className="mt-1 text-xs text-cyan-400">Sample data for previewing the report layout.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!isDemo && !shared && (
            <>
              {canRescan && (
                <button className="btn-ghost" onClick={runRescan} disabled={rescanState.isLoading}>
                  {rescanState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Scan again
                </button>
              )}
              <Link className="btn-ghost" to={`/compare?b=${report._id}`}>
                <GitCompare className="h-4 w-4" /> Compare
              </Link>
              <ShareControl report={report} />
            </>
          )}
          <button className="btn-ghost" onClick={() => downloadReportPdf(report)}>
            <Download className="h-4 w-4" /> Download PDF
          </button>
          <div className="card px-5 py-3 text-right">
            <p className="text-xs text-slate-400">Risk score</p>
            <p className={`text-3xl font-semibold ${riskColor}`}>
              {report.riskScore}
              <span className="text-sm text-slate-500">/100</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <h2 className="mb-5 text-sm font-semibold text-slate-200">Severity summary</h2>
          <SeverityChart summary={report.summary} />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          {SEVERITIES.map((s) => (
            <div key={s} className="card flex items-center justify-between px-5 py-4">
              <SeverityBadge severity={s} />
              <span className="text-2xl font-semibold text-white">{report.summary?.[s] || 0}</span>
            </div>
          ))}
        </div>
      </div>

      {report.aiSummary?.text && <AiSummary summary={report.aiSummary} />}

      <div className="mt-10 mb-4">
        <h2 className="text-lg font-semibold text-white">Architecture map</h2>
        <p className="mt-1 text-sm text-slate-500">
          Each edge is one finding, from the file it lives in to its issue category. Follows the severity filter below.
        </p>
      </div>
      <ArchitectureGraph nodes={graph.nodes} edges={graph.edges} />

      <div className="mt-10 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Vulnerabilities</h2>
        <div className="flex flex-wrap gap-2">
          {['all', ...SEVERITIES].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize ring-1 ring-inset transition ${
                filter === s
                  ? 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/40'
                  : 'text-slate-400 ring-slate-700 hover:bg-slate-800'
              }`}
            >
              {s === 'all' ? 'All' : SEVERITY_META[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {findings.length === 0 ? (
          <p className="text-sm text-slate-500">No findings for this filter.</p>
        ) : (
          findings.map((f) => (
            <FindingCard key={f._id} finding={f} reportId={report._id} showRemediate={!shared && !isDemo} />
          ))
        )}
      </div>

      {report.logs?.length > 0 && (
        <details className="card mt-8 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-300">
            Scan log ({report.logs.length} lines)
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-black/50 p-3 font-mono text-xs leading-relaxed text-slate-400">
            {report.logs.join('\n')}
          </pre>
        </details>
      )}
    </div>
  );
}
