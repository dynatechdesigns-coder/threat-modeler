import { formatDate } from '../../lib/format.js';

const W = 600;
const H = 170;
const PAD = { l: 34, r: 14, t: 14, b: 26 };

const colorFor = (score) => (score >= 70 ? '#ef4444' : score >= 40 ? '#f97316' : '#eab308');

/** Risk score of each finished scan over time (oldest on the left). Lower is better. */
export default function RiskTrend({ reports }) {
  const points = [...reports]
    .filter((r) => r.status === 'completed')
    .sort((a, b) => new Date(a.completedAt || a.createdAt) - new Date(b.completedAt || b.createdAt))
    .slice(-12);

  if (points.length < 2) return null;

  const x = (i) => PAD.l + (i * (W - PAD.l - PAD.r)) / (points.length - 1);
  const y = (score) => PAD.t + ((100 - Math.min(100, Math.max(0, score))) * (H - PAD.t - PAD.b)) / 100;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.riskScore || 0).toFixed(1)}`).join(' ');

  const first = points[0];
  const last = points[points.length - 1];
  const change = (last.riskScore || 0) - (first.riskScore || 0);
  const summary =
    change < 0
      ? `Risk went down by ${-change} points across these scans.`
      : change > 0
        ? `Risk went up by ${change} points across these scans.`
        : 'Risk is unchanged across these scans.';

  return (
    <div className="card mt-8 p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-200">Risk over time</h2>
        <p className={`text-xs ${change < 0 ? 'text-emerald-400' : change > 0 ? 'text-red-400' : 'text-slate-500'}`}>{summary}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Risk score of your last ${points.length} scans. ${summary}`}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#1e293b" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {v}
            </text>
          </g>
        ))}
        <path d={line} fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p._id} cx={x(i)} cy={y(p.riskScore || 0)} r="4.5" fill={colorFor(p.riskScore || 0)} stroke="#020617" strokeWidth="2">
            <title>{`${p.name}: risk ${p.riskScore ?? 0} (${formatDate(p.completedAt || p.createdAt)})`}</title>
          </circle>
        ))}
        <text x={PAD.l} y={H - 6} fontSize="11" fill="#64748b">
          {new Date(first.completedAt || first.createdAt).toLocaleDateString()}
        </text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="11" fill="#64748b">
          {new Date(last.completedAt || last.createdAt).toLocaleDateString()}
        </text>
      </svg>
      <p className="mt-1 text-xs text-slate-500">Each dot is a finished scan. Hover or long-press a dot to see which one.</p>
    </div>
  );
}
