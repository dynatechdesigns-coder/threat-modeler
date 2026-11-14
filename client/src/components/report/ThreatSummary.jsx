import { useEffect, useMemo, useState } from 'react';
import { SEVERITIES, SEVERITY_META } from '../../lib/severity.js';

const CARD_BORDER = {
  critical: 'border-t-red-500/70',
  high: 'border-t-orange-500/70',
  medium: 'border-t-yellow-500/70',
  low: 'border-t-sky-500/70',
};

// Animated summary dashboard: severity stat cards plus a ranked file list.
// Replaces the React Flow map with standard Tailwind — no extra dependencies.
export default function ThreatSummary({ summary = {}, findings = [] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const files = useMemo(() => {
    const counts = new Map();
    for (const f of findings) {
      if (!f?.file) continue;
      counts.set(f.file, (counts.get(f.file) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [findings]);

  const max = files[0]?.count || 1;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {SEVERITIES.map((s, i) => (
          <div
            key={s}
            className={`card animate-fade-in-up border-t-4 px-5 py-4 transition-all hover:-translate-y-1 hover:shadow-lg ${CARD_BORDER[s]}`}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{SEVERITY_META[s].label}</p>
            <p className="mt-1 text-3xl font-semibold text-white">{summary[s] || 0}</p>
          </div>
        ))}
      </div>

      {files.length > 0 && (
        <div className="card mt-4 p-5">
          <h3 className="text-sm font-semibold text-slate-200">Top vulnerable files</h3>
          <ul className="mt-4 space-y-3">
            {files.map(({ file, count }) => (
              <li key={file}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-mono text-xs text-slate-300" title={file}>
                    {file}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {count} finding{count === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-[width] duration-700 ease-out"
                    style={{ width: mounted ? `${Math.max(4, Math.round((count / max) * 100))}%` : '0%' }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
