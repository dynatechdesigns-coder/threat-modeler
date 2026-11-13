export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

// Full class strings are kept here so Tailwind can detect them.
export const SEVERITY_META = {
  critical: { label: 'Critical', badge: 'bg-red-500/10 text-red-400 ring-red-500/30', bar: 'bg-red-500', color: '#ef4444' },
  high: { label: 'High', badge: 'bg-orange-500/10 text-orange-400 ring-orange-500/30', bar: 'bg-orange-500', color: '#f97316' },
  medium: { label: 'Medium', badge: 'bg-yellow-500/10 text-yellow-400 ring-yellow-500/30', bar: 'bg-yellow-500', color: '#eab308' },
  low: { label: 'Low', badge: 'bg-sky-500/10 text-sky-400 ring-sky-500/30', bar: 'bg-sky-500', color: '#0ea5e9' },
};
