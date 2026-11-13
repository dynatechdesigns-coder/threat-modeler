import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Circle, Loader2, X } from 'lucide-react';
import { useScanDemoMutation } from '../../features/scans/scansApi.js';
import { getErrorMessage } from '../../lib/errors.js';

const KEY = 'tm-getting-started-hidden';
const read = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

function Step({ done, children }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      {done ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />}
      <span className={done ? 'text-slate-500 line-through' : 'text-slate-300'}>{children}</span>
    </li>
  );
}

// A short checklist for people who have not scanned their own code yet. It can be dismissed.
export default function GettingStarted({ reports }) {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(read);
  const [scanDemo, { isLoading }] = useScanDemoMutation();
  const [error, setError] = useState('');

  const triedDemo = reports.some((r) => r.name.startsWith('Demo'));
  const scannedOwn = reports.some((r) => !r.name.startsWith('Demo'));
  if (hidden || scannedOwn) return null;

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* hiding for this visit is enough */
    }
  };

  const startDemo = async () => {
    setError('');
    try {
      const report = await scanDemo().unwrap();
      navigate(`/scans/${report._id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="card relative mb-8 border-cyan-500/20 bg-cyan-500/5 p-5">
      <button onClick={hide} className="absolute right-3 top-3 rounded p-1 text-slate-500 hover:text-slate-300" aria-label="Hide getting started">
        <X className="h-4 w-4" />
      </button>
      <h2 className="text-base font-semibold text-white">Welcome. Here is how to get started</h2>
      <p className="mt-1 text-sm text-slate-400">The quickest way to see what this does is to scan a small demo app that has security problems built in.</p>

      <ul className="mt-4 space-y-2">
        <Step done={triedDemo}>Scan the demo app and read its report</Step>
        <Step done={scannedOwn}>
          Scan your own project in the <Link className="text-cyan-300 hover:underline" to="/vault">Code Vault</Link> (upload files or paste a GitHub link)
        </Step>
        <Step done={false}>
          Paste a suspicious message in the <Link className="text-cyan-300 hover:underline" to="/links">Link Checker</Link>
        </Step>
        <Step done={false}>
          Grade your website in <Link className="text-cyan-300 hover:underline" to="/headers">Security headers</Link>
        </Step>
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={startDemo} disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isLoading ? 'Starting...' : triedDemo ? 'Run the demo again' : 'Scan the demo app'}
        </button>
        <Link to="/reports/demo" className="text-sm text-slate-400 hover:text-slate-200">
          Or just look at a sample report
        </Link>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
