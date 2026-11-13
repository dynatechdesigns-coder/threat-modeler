import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { SectionHeading, staggerContainer, staggerItem } from './motion.jsx';
import { TIERS, formatPrice, monthlyPrice } from '../../lib/pricing.js';

const CTA = { free: 'Start free', pro: 'Get Pro', team: 'Get Team' };

function Price({ tier, annual }) {
  const value = formatPrice(monthlyPrice(tier, annual));
  return (
    <div className="flex items-baseline gap-1 text-white">
      <span className="text-2xl">$</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="text-5xl font-semibold"
        >
          {value}
        </motion.span>
      </AnimatePresence>
      <span className="text-sm text-slate-400">/mo</span>
    </div>
  );
}

function PlanCta({ tier, annual }) {
  const className = `${tier.highlighted ? 'btn-primary' : 'btn-ghost'} mt-8 w-full py-2.5`;
  const to = tier.key === 'free' ? '/login' : `/billing?plan=${tier.key}&interval=${annual ? 'annual' : 'monthly'}`;
  return (
    <Link to={to} className={className}>
      {CTA[tier.key]}
    </Link>
  );
}

function PlanCard({ tier, annual }) {
  const body = (
    <div className={`flex h-full flex-col rounded-2xl p-7 ${tier.highlighted ? 'bg-slate-950' : 'card'}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
        {tier.highlighted && (
          <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-400/30">
            Most popular
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-400">{tier.tagline}</p>

      <div className="mt-6 min-h-[4.5rem]">
        <Price tier={tier} annual={annual} />
        <p className="mt-1 min-h-[1rem] text-xs text-slate-500">
          {tier.monthly > 0 && (annual ? `Billed $${tier.annual} per year` : 'Billed monthly')}
        </p>
      </div>

      <ul className="mt-6 flex-1 space-y-3">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm text-slate-300">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
            {f}
          </li>
        ))}
      </ul>

      <PlanCta tier={tier} annual={annual} />
    </div>
  );

  return tier.highlighted ? (
    <div className="rounded-2xl bg-gradient-to-b from-cyan-400 via-indigo-500 to-fuchsia-500 p-px shadow-[0_0_60px_-15px_rgba(34,211,238,0.45)]">
      {body}
    </div>
  ) : (
    body
  );
}

export default function Pricing() {
  const reduce = useReducedMotion();
  const [annual, setAnnual] = useState(true);

  return (
    <section id="pricing" className="scroll-mt-20 px-4 py-24 sm:px-8">
      <SectionHeading
        eyebrow="Pricing"
        title="Start free. Upgrade when you're ready."
        subtitle="The free plan is enough to see what the agent finds in your code. Prices are in US dollars."
      />

      <div className="mt-10 flex justify-center">
        <div className="relative inline-flex rounded-full border border-slate-800 bg-slate-900 p-1 text-sm">
          {[
            ['Monthly', false],
            ['Annual', true],
          ].map(([label, value]) => (
            <button
              key={label}
              onClick={() => setAnnual(value)}
              className="relative rounded-full px-5 py-1.5 font-medium"
              aria-pressed={annual === value}
            >
              {annual === value && (
                <motion.span
                  layoutId="billing-pill"
                  className="absolute inset-0 rounded-full bg-cyan-500/15 ring-1 ring-cyan-400/40"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className={`relative ${annual === value ? 'text-cyan-300' : 'text-slate-400'}`}>
                {label}
                {value && <span className="ml-1.5 text-xs text-emerald-400">-20%</span>}
              </span>
            </button>
          ))}
        </div>
      </div>

      <motion.div
        variants={staggerContainer}
        initial={reduce ? 'show' : 'hidden'}
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="mx-auto mt-12 grid max-w-5xl items-stretch gap-6 lg:grid-cols-3"
      >
        {TIERS.map((tier) => (
          <motion.div
            key={tier.key}
            variants={staggerItem}
            whileHover={reduce ? undefined : { y: -6 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          >
            <PlanCard tier={tier} annual={annual} />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
