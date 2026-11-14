import { useMemo, useState } from 'react';
import { SEVERITIES } from '../../lib/severity.js';
import SeverityBadge from '../ui/SeverityBadge.jsx';

const SEV_RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));

const BLAST_BAR = {
  Severe: 'bg-red-500',
  High: 'bg-orange-500',
  Moderate: 'bg-yellow-500',
};

function impactFor(finding) {
  const text = `${finding.category || ''} ${finding.cwe || ''} ${finding.title || ''}`.toLowerCase();
  if (/sql|inject|cwe-89|command|cwe-78|deserial|cwe-94|rce|remote code/.test(text))
    return { impact: 'Database Compromise', blast: 'Severe', via: finding.title };
  if (/secret|cwe-798|credential|token|key/.test(text))
    return { impact: 'Credential Theft', blast: 'Severe', via: finding.title };
  if (/auth|access|privilege|idor|cwe-862|cwe-639|role|admin/.test(text))
    return { impact: 'Privilege Escalation', blast: 'High', via: finding.title };
  if (/cors|cwe-942|headers|cwe-693|disclosure|cwe-209|leak|xss/.test(text))
    return { impact: 'Data Leak', blast: 'Moderate', via: finding.title };
  if (/rate|brute|credential stuffing|cwe-307|login/.test(text))
    return { impact: 'Account Takeover', blast: 'High', via: finding.title };
  if (/crypto|jwt|cwe-321|weak/.test(text))
    return { impact: 'Data Leak', blast: 'High', via: finding.title };
  return { impact: 'Data Leak', blast: 'Moderate', via: finding.title };
}

// Interactive tracer: entry-point files on one side, their blast radius on the
// other, joined by an animated SVG attack path. Plain React + Tailwind + SVG.
export default function AttackPathTracer({ findings = [] }) {
  const entries = useMemo(() => {
    const byFile = new Map();
    for (const f of findings) {
      if (!f?.file) continue;
      if (!byFile.has(f.file)) byFile.set(f.file, []);
      byFile.get(f.file).push(f);
    }
    return [...byFile.entries()]
      .map(([file, items]) => {
        const worst = items
          .slice()
          .sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9))[0];
        return { file, items, worst, count: items.length };
      })
      .sort(
        (a, b) =>
          (SEV_RANK[a.worst?.severity] ?? 9) - (SEV_RANK[b.worst?.severity] ?? 9) ||
          b.count - a.count
      )
      .slice(0, 4)
      .map((e) => ({ ...e, paths: e.items.slice(0, 3).map(impactFor) }));
  }, [findings]);

  const [activeFile, setActiveFile] = useState(null);
  if (entries.length === 0) return null;
  const active = entries.find((e) => e.file === activeFile) || entries[0];

  return (
    <section aria-label="Attack path and blast radius" className="card mt-4 p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-200">Attack Path &amp; Blast Radius Tracer</h2>
        <p className="text-xs text-slate-500">Hover or tap an entry point to trace its path</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ol className="space-y-2">
          {entries.map((entry) => {
            const isActive = entry.file === active.file;
            const isCritical = entry.worst?.severity === 'critical';
            return (
              <li key={entry.file}>
                <button
                  type="button"
                  onClick={() => setActiveFile(entry.file)}
                  onMouseEnter={() => setActiveFile(entry.file)}
                  onFocus={() => setActiveFile(entry.file)}
                  aria-expanded={isActive}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-300 ${
                    isActive
                      ? 'border-cyan-500/40 bg-cyan-500/5'
                      : 'border-slate-800 bg-black/20 hover:border-slate-700'
                  }`}
                >
                  <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                    {isCritical && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                        isCritical ? 'bg-red-500' : entry.worst?.severity === 'high' ? 'bg-orange-500' : 'bg-yellow-500'
                      }`}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs text-slate-200" title={entry.file}>
                      {entry.file}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      Entry point · {entry.count} finding{entry.count === 1 ? '' : 's'}
                    </span>
                  </span>
                  <SeverityBadge severity={entry.worst?.severity} />
                </button>

                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    isActive ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <svg viewBox="0 0 200 24" className="mt-1 h-6 w-full" aria-hidden="true" preserveAspectRatio="none">
                      <line
                        x1="12"
                        y1="12"
                        x2="188"
                        y2="12"
                        stroke={isCritical ? '#ef4444' : '#22d3ee'}
                        strokeWidth="2"
                        strokeDasharray="6 5"
                        strokeLinecap="round"
                      >
                        <animate attributeName="stroke-dashoffset" from="22" to="0" dur="1s" repeatCount="indefinite" />
                      </line>
                      <circle cx="12" cy="12" r="3.5" fill={isCritical ? '#ef4444' : '#22d3ee'} />
                      <path d="M182 7 L190 12 L182 17" fill="none" stroke={isCritical ? '#ef4444' : '#22d3ee'} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div key={active.file} className="rounded-lg border border-slate-800 bg-black/20 p-4">
          <p className="truncate font-mono text-xs text-slate-400" title={active.file}>
            {active.file}
          </p>
          <ul className="mt-3 space-y-3">
            {active.paths.map((p, i) => (
              <li key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 transition-all duration-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-100">{p.impact}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      p.blast === 'Severe' ? 'bg-red-500/10 text-red-400' : p.blast === 'High' ? 'bg-orange-500/10 text-orange-400' : 'bg-yellow-500/10 text-yellow-400'
                    }`}
                  >
                    {p.blast} blast radius
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${BLAST_BAR[p.blast] || 'bg-yellow-500'}`}
                    style={{ width: p.blast === 'Severe' ? '100%' : p.blast === 'High' ? '66%' : '33%' }}
                  />
                </div>
                <p className="mt-2 truncate text-xs text-slate-500" title={p.via}>
                  via {p.via}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
            Fix the entry-point file to cut every path shown here.
          </p>
        </div>
      </div>
    </section>
  );
}
