import { motion, useReducedMotion } from 'framer-motion';
import { FileText, Gauge, GitBranch, Lock, Network, Share2, ShieldCheck } from 'lucide-react';
import { SectionHeading, staggerContainer, staggerItem } from './motion.jsx';

const FEATURES = [
  {
    icon: Network,
    title: 'Threat models, not just scans',
    text: 'Findings are organized around trust boundaries and data flows using the STRIDE framework.',
  },
  {
    icon: Lock,
    title: 'Your code stays yours',
    text: 'Uploaded files are treated as untrusted data. They are stored securely and never run.',
  },
  {
    icon: Gauge,
    title: 'Ranked by real risk',
    text: 'Every finding gets a severity and a single risk score, so you fix what matters first.',
  },
  {
    icon: FileText,
    title: 'Fixes you can act on',
    text: 'Each issue includes the file, line, CWE reference and a clear recommendation.',
  },
  {
    icon: GitBranch,
    title: 'Scan a repo, or every push',
    text: 'Paste a GitHub link, or connect a webhook so every push is scanned and you hear about new problems.',
  },
  {
    icon: Share2,
    title: 'Share and export',
    text: 'Send a read-only link to a client or teammate, or download the report as a PDF.',
  },
  {
    icon: ShieldCheck,
    title: 'Headers and link checks',
    text: 'Check a live site\'s security headers, and test suspicious links before anyone clicks.',
  },
];

export default function Features() {
  const reduce = useReducedMotion();

  return (
    <section id="features" className="scroll-mt-20 px-4 py-24 sm:px-8">
      <SectionHeading
        eyebrow="Why Threat Modeler"
        title="Built for developers, not security teams"
        subtitle="The depth of a security review, without the calendar invite."
      />

      <motion.div
        variants={staggerContainer}
        initial={reduce ? 'show' : 'hidden'}
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="mx-auto mt-14 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {FEATURES.map((f) => (
          <motion.div
            key={f.title}
            variants={staggerItem}
            className="card p-6 transition-colors hover:border-slate-600 hover:bg-slate-900"
          >
            <f.icon className="h-6 w-6 text-cyan-400" />
            <h3 className="mt-4 font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.text}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
