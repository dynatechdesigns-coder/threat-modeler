import { Reveal } from './motion.jsx';
import WaitlistForm from './WaitlistForm.jsx';

export default function WaitlistSection() {
  return (
    <section id="waitlist" className="scroll-mt-20 px-4 py-24 sm:px-8">
      <Reveal>
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-16 text-center sm:px-12">
          <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Get early access</h2>
            <p className="mx-auto mt-4 max-w-xl text-slate-400">
              Join the waitlist and we'll let you know the moment the agent opens up. No spam, one email when it's your
              turn.
            </p>
            <div className="mt-8">
              <WaitlistForm source="landing-waitlist" />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
