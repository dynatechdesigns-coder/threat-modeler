const STYLES = {
  uploaded: 'bg-slate-500/10 text-slate-300 ring-slate-500/30',
  running: 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/30',
  completed: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  failed: 'bg-red-500/10 text-red-300 ring-red-500/30',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STYLES[status] || STYLES.uploaded}`}>
      {status}
    </span>
  );
}
