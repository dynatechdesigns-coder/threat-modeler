import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Gauge, ListChecks } from 'lucide-react';

const TONES = {
  cmd: 'text-cyan-300',
  info: 'text-slate-400',
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  ok: 'text-emerald-400',
};

const SCRIPT = [
  { text: '$ threat-agent scan ./shop-api', tone: 'cmd' },
  { text: 'Indexing 142 files...', tone: 'info' },
  { text: 'Mapping trust boundaries (STRIDE)...', tone: 'info' },
  { text: '[CRITICAL] SQL injection', loc: 'db/queries.js:48', tone: 'critical' },
  { text: '[HIGH] Missing authorization', loc: 'routes/admin.js:21', tone: 'high' },
  { text: '[MEDIUM] Wildcard CORS policy', loc: 'server.js:25', tone: 'medium' },
  { text: 'Generating fixes... done', tone: 'ok' },
];

function Background() {
  const reduce = useReducedMotion();
  const drift = (x, y, duration) =>
    reduce ? {} : { animate: { x: [0, x, 0], y: [0, y, 0] }, transition: { duration, repeat: Infinity, ease: 'easeInOut' } };

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="bg-grid absolute inset-0" />
      <motion.div className="absolute -top-24 left-[15%] h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" {...drift(50, 30, 14)} />
      <motion.div className="absolute right-[8%] top-16 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" {...drift(-40, 40, 17)} />
      <motion.div className="absolute left-[40%] top-64 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" {...drift(30, -30, 19)} />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent" />
    </div>
  );
}

// A looping, fake agent session. It's decoration only.
function HeroTerminal() {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(reduce ? SCRIPT.length : 0);

  useEffect(() => {
    if (reduce) {
      setCount(SCRIPT.length);
      return undefined;
    }
    const finished = count >= SCRIPT.length;
    const t = setTimeout(() => setCount((c) => (c >= SCRIPT.length ? 0 : c + 1)), finished ? 3500 : 850);
    return () => clearTimeout(t);
  }, [count, reduce]);

  const float = (distance, duration) =>
    reduce ? {} : { animate: { y: [0, distance, 0] }, transition: { duration, repeat: Infinity, ease: 'easeInOut' } };

  return (
    <div className="relative">
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-cyan-400/40 via-indigo-500/30 to-fuchsia-500/30 blur-xl" />
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/90 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-red-500/80" />
          <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
          <span className="ml-3 font-mono text-xs text-slate-500">threat-agent</span>
        </div>
        {/* On phones the file location drops to its own line instead of wrapping, so this height holds every line. */}
        <div className="h-[21rem] space-y-1.5 p-4 font-mono text-[12px] leading-relaxed sm:h-64 sm:text-sm">
          {SCRIPT.slice(0, count).map((line, i) => (
            <motion.div
              key={i}
              initial={reduce ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className={TONES[line.tone]}
            >
              {line.text}
              {line.loc && <span className="block text-slate-500 sm:ml-2 sm:inline">{line.loc}</span>}
            </motion.div>
          ))}
          {!reduce && <span className="inline-block h-4 w-2 animate-pulse bg-cyan-400 align-middle" />}
        </div>
      </div>

      <motion.div
        {...float(-8, 5)}
        className="absolute -right-3 -top-5 hidden items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 shadow-xl sm:flex"
      >
        <Gauge className="h-4 w-4 text-orange-400" />
        <span className="text-xs text-slate-300">Risk score <b className="text-white">79</b></span>
      </motion.div>
      <motion.div
        {...float(8, 6)}
        className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 shadow-xl sm:flex"
      >
        <ListChecks className="h-4 w-4 text-cyan-400" />
        <span className="text-xs text-slate-300"><b className="text-white">10</b> findings ranked</span>
      </motion.div>
    </div>
  );
}

export default function Hero() {
  const reduce = useReducedMotion();
  const fadeUp = (delay) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] } };

  return (
    <section id="top" className="relative overflow-hidden pb-24 pt-32 sm:pt-40">
      <Background />
      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-4 sm:px-8 lg:grid-cols-2">
        <div>
          <motion.div
            {...fadeUp(0)}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            Agentic threat modeling for developers
          </motion.div>

          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 24, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="gradient-text mt-6 text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
          >
            AI Pentesting in a Box
          </motion.h1>

          <motion.p {...fadeUp(0.25)} className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
            Drop in your code. An autonomous agent maps your attack surface, hunts for real vulnerabilities, and hands
            back a ranked report with a fix for every finding.
          </motion.p>

          <motion.div {...fadeUp(0.4)} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="#waitlist" className="btn-primary group px-6 py-3 text-base">
              Join the waitlist
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <Link to="/demo" className="btn-ghost px-6 py-3 text-base">Try the live demo — no signup</Link>
          </motion.div>

          <motion.p {...fadeUp(0.5)} className="mt-4 text-sm text-slate-500">
            Free to start. No credit card required.
          </motion.p>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <HeroTerminal />
        </motion.div>
      </div>
    </section>
  );
}
