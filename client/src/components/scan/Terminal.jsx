import { useEffect, useRef } from 'react';

function lineClass(line) {
  if (line.startsWith('$')) return 'text-cyan-300';
  if (line.includes('[CRITICAL]')) return 'text-red-400';
  if (line.includes('[HIGH]')) return 'text-orange-400';
  if (line.includes('[MEDIUM]')) return 'text-yellow-400';
  if (line.includes('[WARN]')) return 'text-amber-300';
  if (line.includes('[DONE]')) return 'text-emerald-300';
  if (line.includes('[ERROR]')) return 'text-red-400';
  return 'text-slate-300';
}

export default function Terminal({ lines, title = 'threat-agent', running }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-black/60">
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-4 py-2">
        <span className="h-3 w-3 rounded-full bg-red-500/80" />
        <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
        <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
        <span className="ml-3 font-mono text-xs text-slate-400">{title}</span>
      </div>
      <div className="h-80 overflow-y-auto p-4 font-mono text-sm leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className={lineClass(line)}>
            {line}
          </div>
        ))}
        {running && <span className="inline-block h-4 w-2 animate-pulse bg-cyan-400 align-middle" />}
        <div ref={endRef} />
      </div>
    </div>
  );
}
