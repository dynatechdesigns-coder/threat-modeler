import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import ThreatReport from './ThreatReport.jsx';

// The page a client sees when you send them a share link. Read-only, and no sign-in is needed.
export default function SharedReport() {
  // Keep shared reports out of search engines.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-cyan-400" />
            <span className="font-semibold text-white">Threat Modeler</span>
          </Link>
          <span className="text-xs text-slate-500">Read-only shared report</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <ThreatReport shared />
      </main>
    </div>
  );
}
