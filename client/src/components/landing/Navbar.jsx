import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, ShieldAlert, X } from 'lucide-react';
import { selectToken } from '../../features/auth/authSlice.js';

const LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
];

export default function Navbar() {
  const token = useSelector(selectToken);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open ? 'border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
        <a href="#top" className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-cyan-400" />
          <span className="text-lg font-semibold text-white">Threat Modeler</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-slate-400 transition hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {token ? (
            <Link to="/dashboard" className="btn-primary">Open dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">Sign in</Link>
              <a href="#waitlist" className="btn-primary">Join waitlist</a>
            </>
          )}
        </div>

        <button
          className="text-slate-300 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden md:hidden"
          >
            <div className="space-y-1 px-4 pb-5 pt-2">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-900"
                >
                  {l.label}
                </a>
              ))}
              <div className="flex gap-3 pt-3">
                {token ? (
                  <Link to="/dashboard" className="btn-primary flex-1">Open dashboard</Link>
                ) : (
                  <>
                    <Link to="/login" className="btn-ghost flex-1">Sign in</Link>
                    <a href="#waitlist" onClick={() => setOpen(false)} className="btn-primary flex-1">
                      Join waitlist
                    </a>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
