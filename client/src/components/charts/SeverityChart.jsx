import { SEVERITIES, SEVERITY_META } from '../../lib/severity.js';

const R = 70;
const C = 2 * Math.PI * R;

export default function SeverityChart({ summary }) {
  const total = summary?.total || SEVERITIES.reduce((n, s) => n + (summary?.[s] || 0), 0);

  let offset = 0;
  const segments = SEVERITIES.map((s) => {
    const count = summary?.[s] || 0;
    const len = total ? (count / total) * C : 0;
    const seg = { s, count, len, offset };
    offset += len;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
          <circle cx="90" cy="90" r={R} fill="none" stroke="#1e293b" strokeWidth="18" />
          {segments.map(
            (seg) =>
              seg.len > 0 && (
                <circle
                  key={seg.s}
                  cx="90"
                  cy="90"
                  r={R}
                  fill="none"
                  stroke={SEVERITY_META[seg.s].color}
                  strokeWidth="18"
                  strokeDasharray={`${seg.len} ${C - seg.len}`}
                  strokeDashoffset={-seg.offset}
                />
              )
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold text-white">{total}</span>
          <span className="text-xs text-slate-400">findings</span>
        </div>
      </div>

      <div className="w-full space-y-3">
        {segments.map((seg) => (
          <div key={seg.s}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-slate-300">{SEVERITY_META[seg.s].label}</span>
              <span className="text-slate-400">{seg.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full ${SEVERITY_META[seg.s].bar}`}
                style={{ width: total ? `${(seg.count / total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
