import { Reveal, SectionHeading } from './motion.jsx';
import SeverityChart from '../charts/SeverityChart.jsx';
import SeverityBadge from '../ui/SeverityBadge.jsx';
import { sampleReport } from '../../data/sampleReport.js';

/** A look at a real report. Built from the same components and sample data as the app's Sample Report page. */
export default function Preview() {
  const top = [...sampleReport.findings].slice(0, 3);

  return (
    <section id="preview" className="scroll-mt-20 px-4 py-24 sm:px-8">
      <SectionHeading
        eyebrow="See it"
        title="What a report looks like"
        subtitle="A risk score, a severity breakdown, and every finding with the file, the line and the fix."
      />
      <Reveal className="mx-auto mt-14 max-w-4xl" y={32}>
        <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl shadow-cyan-500/5">
          <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="ml-3 truncate text-xs text-slate-500">Sample report for a demo app</span>
          </div>
          <div className="p-5 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-white">Threat Report</p>
                <p className="text-sm text-slate-400">{sampleReport.name}</p>
              </div>
              <div className="card px-4 py-2 text-right">
                <p className="text-xs text-slate-400">Risk score</p>
                <p className="text-2xl font-semibold text-red-400">
                  {sampleReport.riskScore}
                  <span className="text-sm text-slate-500">/100</span>
                </p>
              </div>
            </div>
            <div className="card mt-6 p-5">
              <SeverityChart summary={sampleReport.summary} />
            </div>
            <ul className="mt-5 space-y-3">
              {top.map((f) => (
                <li key={f._id} className="card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="font-medium text-white">{f.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {f.file}:{f.line} · {f.cwe}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">{f.recommendation}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
