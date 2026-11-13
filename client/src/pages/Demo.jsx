import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import Terminal from '../components/scan/Terminal.jsx';
import SeverityBadge from '../components/ui/SeverityBadge.jsx';
import { SEVERITIES } from '../lib/severity.js';
import { getErrorMessage } from '../lib/errors.js';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function postDemo() {
  const res = await fetch(`${API_BASE}/scans/demo`, { method: 'POST' });
  if (res.status === 429) throw new Error('The demo is busy right now. Please try again in a minute');
  if (!res.ok) throw new Error(`Demo failed to start (HTTP ${res.status})`);
  const data = await res.json();
  return data.report;
}

async function fetchDemo(id) {
  const res = await fetch(`${API_BASE}/scans/demo/${id}`);
  if (!res.ok) throw new Error(`Demo report unavailable (HTTP ${res.status})`);
  const data = await res.json();
  return data.report;
}

// Public one-click demo for hackathon judges: no account, no password.
// Runs the built-in vulnerable app through the real scanner and streams progress.
export default function Demo() {
  const [phase, setPhase] = useState('idle');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const timer = useRef(null);

  const stopPolling = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => stopPolling, []);

  const poll = useCallback((id) => {
    stopPolling();
    timer.current = setInterval(async () => {
      try {
        const next = await fetchDemo(id);
        setReport(next);
        if (next.status === 'completed' || next.status === 'failed') {
          stopPolling();
          setPhase(next.status === 'completed' ? 'done' : 'error');
          if (next.status === 'failed') setError(next.error || 'The demo scan failed. Please try again');
        }
      } catch (err) {
        stopPolling();
        setPhase('error');
        setError(getErrorMessage(err));
      }
    }, 2500);
  }, []);

  const start = async () => {
    setError('');
    setReport(null);
    setPhase('starting');
    try {
      const created = await postDemo();
      setReport(created);
      setPhase('running');
      poll(created._id);
    } catch (err) {
      setPhase('error');
      setError(getErrorMessage(err));
    }
  };

  const reset = () => {
    stopPolling();
    setReport(null);
    setError('');
    setPhase('idle');
  };

  const running = phase === 'starting' || phase === 'running';
  const findings = report?.findings || [];
  const summary = report?.summary || {};

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-white">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            Threat Modeler
          </Link>
          <Link to="/login" className="btn-ghost px-4 py-2 text-sm">Sign in</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        {phase === 'idle' && (
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Watch it hack itself.</h1>
            <p className="mx-auto mt-4 max-w-xl text-slate-400">
              One click runs a real scan of a built-in vulnerable app — static rules, dependency
              check, and AI review — right here. No account, no password.
            </p>
            <button type="button" onClick={start} className="btn-primary mx-auto mt-8 px-6 py-3 text-base">
              Run the live demo
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="mt-4 text-sm text-slate-500">Takes about a minute. First run can be slower if the server is waking up.</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <p className="text-red-300">{error || 'Something went wrong.'}</p>
            <button type="button" onClick={reset} className="btn-ghost mx-auto mt-4 px-5 py-2 text-sm">
              <RotateCcw className="h-4 w-4" />
              Try again
            </button>
          </div>
        )}

        {running && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
              <p className="text-slate-300">Scanning the demo app… you can watch every step below.</p>
            </div>
            <Terminal lines={report?.logs || ['Starting demo scan…']} running />
          </div>
        )}

        {phase === 'done' && report && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {SEVERITIES.map((s) => (
                <span key={s} className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm">
                  <SeverityBadge severity={s} />
                  <b className="text-white">{summary[s] ?? 0}</b>
                </span>
              ))}
              {typeof report.riskScore === 'number' && (
                <span className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-400">
                  Risk score <b className="text-white">{report.riskScore}</b>
                </span>
              )}
            </div>

            {report.aiSummary?.text && (
              <p className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4 text-slate-300">{report.aiSummary.text}</p>
            )}

            <div className="mt-6 space-y-3">
              {findings.map((f) => (
                <article key={f._id || f.title} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <h3 className="font-semibold text-white">{f.title}</h3>
                  </div>
                  {(f.file || f.cwe) && (
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {[f.file && f.line ? `${f.file}:${f.line}` : f.file, f.cwe].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {f.description && <p className="mt-2 text-sm text-slate-400">{f.description}</p>}
                  {f.recommendation && <p className="mt-2 text-sm text-slate-300"><span className="text-emerald-400">Fix: </span>{f.recommendation}</p>}
                </article>
              ))}
            </div>

            <div className="mt-10 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-6 text-center">
              <h2 className="text-xl font-bold text-white">That's the demo. Imagine it on your code.</h2>
              <p className="mt-2 text-sm text-slate-400">Sign up free to scan your own projects, track fixes, and watch repos.</p>
              <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
                <Link to="/login" className="btn-primary px-6 py-3 text-base">
                  Scan your own code
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button type="button" onClick={reset} className="btn-ghost px-6 py-3 text-base">
                  <RotateCcw className="h-4 w-4" />
                  Run demo again
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
