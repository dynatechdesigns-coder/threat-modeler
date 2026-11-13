import { motion, useReducedMotion } from 'framer-motion';

/** Fades and slides children in once they scroll into view. Respects reduced-motion settings. */
export function Reveal({ children, delay = 0, y = 24, className = '', as = 'div' }) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Tag>
  );
}

export function SectionHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Reveal>
        <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">{eyebrow}</p>
      </Reveal>
      <Reveal delay={0.08}>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      </Reveal>
      {subtitle && (
        <Reveal delay={0.16}>
          <p className="mt-4 text-base text-slate-400">{subtitle}</p>
        </Reveal>
      )}
    </div>
  );
}

// Stagger helpers for grids of cards.
export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};
