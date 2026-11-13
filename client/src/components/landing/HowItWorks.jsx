import { motion, useReducedMotion } from 'framer-motion';
import { Radar, UploadCloud, Wrench } from 'lucide-react';
import { Reveal, SectionHeading } from './motion.jsx';

const STEPS = [
  {
    icon: UploadCloud,
    title: 'Upload your code',
    text: 'Drag in source files or a zip archive. Everything is stored securely and your code is never executed.',
  },
  {
    icon: Radar,
    title: 'The agent hunts',
    text: 'It maps trust boundaries, traces data flows and probes for injection, broken access control, leaked secrets and risky dependencies.',
  },
  {
    icon: Wrench,
    title: 'Get fixes',
    text: 'Receive a severity-ranked report with the exact file and line, plus a concrete remediation for each finding.',
  },
];

export default function HowItWorks() {
  const reduce = useReducedMotion();

  return (
    <section id="how-it-works" className="scroll-mt-20 px-4 py-24 sm:px-8">
      <SectionHeading
        eyebrow="How it works"
        title="From upload to fixes in three steps"
        subtitle="No setup, no scanners to configure, no security team required."
      />

      <div className="relative mx-auto mt-16 grid max-w-6xl gap-6 md:grid-cols-3">
        {/* Connector line that draws itself between the cards */}
        <motion.div
          aria-hidden
          initial={reduce ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 1.2, delay: 0.3, ease: 'easeInOut' }}
          className="absolute left-[16%] right-[16%] top-12 hidden h-px origin-left bg-gradient-to-r from-cyan-500/0 via-cyan-500/60 to-cyan-500/0 md:block"
        />

        {STEPS.map((step, i) => (
          <Reveal key={step.title} delay={i * 0.15}>
            <motion.div
              whileHover={reduce ? undefined : { y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="card group relative h-full p-6 transition-colors hover:border-cyan-500/40"
            >
              <div className="flex items-center justify-between">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/30 bg-slate-950">
                  <div className="absolute inset-0 rounded-xl bg-cyan-500/20 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
                  <step.icon className="relative h-6 w-6 text-cyan-300" />
                </div>
                <span className="font-mono text-sm text-slate-600">0{i + 1}</span>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.text}</p>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
