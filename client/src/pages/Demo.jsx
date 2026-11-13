import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, FolderUp, Link2, Loader2, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
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

const MAX_DEMO_BYTES = 100 * 1024 * 1024;

async function postDemoGithub(url) {
  const res = await fetch(`${API_BASE}/scans/demo/github`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (res.status === 429) throw new Error('The demo is busy right now. Please try again in a minute');
  if (!res.ok) {
    let message = `Scan failed to start (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // Ignore
    }
    throw new Error(message);
  }
  const data = await res.json();
  return data.report;
}

// Mirror of the server's ignored directories: no point uploading them,
// and node_modules alone would blow the size budget.
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor', '__pycache__',
  '.venv', 'venv', 'target', '.idea', '.vscode', '__MACOSX',
]);

// Reads dropped files, descending into project folders (the picker itself
// only gives files). Directory entries are flattened with their paths kept,
// executables are left out here too — the server blocks them as well.
async function filesFromDrop(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  if (!items.length || !items[0]?.webkitGetAsEntry) return Array.from(dataTransfer?.files || []);
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const f = await new Promise((resolve, reject) => entry.file(resolve, reject));
      out.push(new File([f], prefix + f.name, { type: f.type }));
    } else if (entry.isDirectory && !IGNORED_DIRS.has(entry.name)) {
      const reader = entry.createReader();
      let batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      while (batch.length) {
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      }
    }
  };
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) await walk(entry, '');
  }
  return out.length ? out : Array.from(dataTransfer?.files || []);
}

async function postDemoUpload(files) {
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_DEMO_BYTES) throw new Error('Those files total over 100MB. Try a smaller set or a zip of just your source files');
  const form = new FormData();
  for (const f of files.slice(0, 40)) form.append('files', f);
  const res = await fetch(`${API_BASE}/scans/demo/upload`, { method: 'POST', body: form });
  if (res.status === 429) throw new Error('The demo is busy right now. Please try again in a minute');
  if (!res.ok) {
    let message = `Upload failed (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // Ignore
    }
    throw new Error(message);
  }
  const data = await res.json();
  return data.report;
}

// Public one-click demo for hackathon judges: no account, no password.
// Runs the built-in vulnerable app through the real scanner and streams progress.
export default function Demo() {
  const [phase, setPhase] = useState('idle');
  const [mode, setMode] = useState('sample');
  const [ranNoun, setRanNoun] = useState('the demo app');
  const [files, setFiles] = useState([]);
  const [repoUrl, setRepoUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
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

  const start = async (which = mode, chosen = files, url = repoUrl) => {
    setError('');
    setReport(null);
    setPhase('starting');
    try {
      if (which === 'own' && chosen.length === 0) throw new Error('Choose at least one code file or a zip to scan');
      if (which === 'github' && !url.trim()) throw new Error('Paste a public GitHub repository link first');
      setRanNoun(which === 'github' ? 'this repo' : which === 'own' ? 'your code' : 'the demo app');
      let created;
      if (which === 'own') created = await postDemoUpload(chosen);
      else if (which === 'github') created = await postDemoGithub(url.trim());
      else created = await postDemo();
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
    setFiles([]);
    setRepoUrl('');
    setDragOver(false);
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
          <div className="flex items-center gap-2">
            <Link to="/" className="btn-ghost px-4 py-2 text-sm">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <Link to="/login" className="btn-ghost px-4 py-2 text-sm">Sign in</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        {phase === 'idle' && (
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Watch it hack itself.</h1>
            <p className="mx-auto mt-4 max-w-xl text-slate-400">
              A real scan — static rules, dependency check, and AI review — right here.
              No account, no password.
            </p>

            <div className="mx-auto mt-8 inline-flex flex-wrap justify-center rounded-xl border border-slate-800 bg-slate-900 p-1 text-sm">
              <button
                type="button"
                onClick={() => setMode('sample')}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 ${mode === 'sample' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
              >
                <Sparkles className="h-4 w-4" />
                Sample app
              </button>
              <button
                type="button"
                onClick={() => setMode('own')}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 ${mode === 'own' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
              >
                <FolderUp className="h-4 w-4" />
                Your code
              </button>
              <button
                type="button"
                onClick={() => setMode('github')}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 ${mode === 'github' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
              >
                <Link2 className="h-4 w-4" />
                GitHub repo
              </button>
            </div>

            {mode === 'sample' ? (
              <div>
                <button type="button" onClick={() => start('sample')} className="btn-primary mx-auto mt-6 px-6 py-3 text-base">
                  Run the live demo
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : mode === 'github' ? (
              <div className="mx-auto mt-6 max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-6">
                <input
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') start('github', [], repoUrl); }}
                  placeholder="https://github.com/owner/repo"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => start('github', [], repoUrl)}
                  disabled={!repoUrl.trim()}
                  className="btn-primary mx-auto mt-4 px-6 py-3 text-base disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Scan this repo
                  <ArrowRight className="h-4 w-4" />
                </button>
                <p className="mt-3 text-xs text-slate-500">Public repositories only. Private repos need a free account.</p>
              </div>
            ) : (
              <div className="mx-auto mt-6 max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-6">
                <label
                  className={`block cursor-pointer rounded-xl border border-dashed p-6 transition-colors ${dragOver ? 'border-cyan-400 bg-cyan-500/10 text-slate-200' : 'border-slate-700 text-slate-400 hover:border-cyan-500/50'}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const dropped = await filesFromDrop(e.dataTransfer);
                    if (dropped.length) setFiles(dropped.slice(0, 40));
                  }}
                >
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 40))}
                  />
                  {files.length === 0 ? (
                    <span>Drag & drop code files, a zip, or a whole project folder here, or click to browse <span className="text-slate-500">(100MB total)</span></span>
                  ) : (
                    <span className="text-slate-200">{files.length} file{files.length === 1 ? '' : 's'} selected — drop to replace</span>
                  )}
                </label>
                {files.length > 0 && (
                  <ul className="mt-3 space-y-1 text-left font-mono text-xs text-slate-500">
                    {files.slice(0, 12).map((f) => (
                      <li key={f.name + f.size} className="truncate">{f.name}</li>
                    ))}
                    {files.length > 12 && <li>…and {files.length - 12} more</li>}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => start('own')}
                  disabled={files.length === 0}
                  className="btn-primary mx-auto mt-4 px-6 py-3 text-base disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Scan my code
                  <ArrowRight className="h-4 w-4" />
                </button>
                <p className="mt-3 text-xs text-slate-500">Files are only read as text, never executed, and auto-deleted after the scan.</p>
              </div>
            )}
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
              <p className="text-slate-300">Scanning {ranNoun}… you can watch every step below.</p>
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
              <h2 className="text-xl font-bold text-white">{ranNoun === 'the demo app' ? "That's the demo. Imagine it on your code." : `That was ${ranNoun}. Imagine this on every commit.`}</h2>
              <p className="mt-2 text-sm text-slate-400">Sign up free to save reports, track fixes, and watch repos.</p>
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
