import { SEVERITY_META } from '../../lib/severity.js';

export default function SeverityBadge({ severity }) {
  const meta = SEVERITY_META[severity] || SEVERITY_META.low;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.badge}`}>
      {meta.label}
    </span>
  );
}
