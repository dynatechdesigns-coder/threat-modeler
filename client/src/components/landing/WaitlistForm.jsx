import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { useJoinWaitlistMutation } from '../../features/waitlist/waitlistApi.js';
import { getErrorMessage } from '../../lib/errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Standalone email capture. Drop it anywhere: <WaitlistForm source="footer" /> */
export default function WaitlistForm({ source = 'landing' }) {
  const [join, { isLoading }] = useJoinWaitlistMutation();
  const [email, setEmail] = useState('');
  const [trap, setTrap] = useState(''); // honeypot: real users never see or fill this
  const [error, setError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const value = email.trim();
    if (!EMAIL_RE.test(value)) return setError('Please enter a valid email address');
    if (trap) return setDoneMessage("You're on the list!"); // bot: pretend it worked

    try {
      const res = await join({ email: value, source }).unwrap();
      setDoneMessage(res.message);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <AnimatePresence mode="wait" initial={false}>
        {doneMessage ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="flex items-center justify-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-left"
            role="status"
          >
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
            <p className="text-sm text-emerald-200">{doneMessage}</p>
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={submit} noValidate exit={{ opacity: 0, y: -8 }}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  className="input py-3 pl-10"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Email address"
                  aria-invalid={Boolean(error)}
                  autoComplete="email"
                />
              </div>
              <button className="btn-primary px-6 py-3" disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Get early access
              </button>
            </div>

            {/* Honeypot */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              name="company"
            />

            <AnimatePresence>
              {error && (
                <motion.p
                  key={error}
                  initial={{ opacity: 0, x: 0 }}
                  animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="mt-3 text-left text-sm text-red-400"
                  role="alert"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
