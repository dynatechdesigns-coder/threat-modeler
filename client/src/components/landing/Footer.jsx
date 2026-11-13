import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-slate-800 px-4 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-cyan-400" />
          <span className="font-semibold text-white">Threat Modeler</span>
        </div>
        <nav className="flex gap-6 text-sm text-slate-400">
          <a href="#how-it-works" className="hover:text-white">How it works</a>
          <a href="#pricing" className="hover:text-white">Pricing</a>
          <Link to="/login" className="hover:text-white">Sign in</Link>
        </nav>
        <p className="max-w-xs text-center text-xs text-slate-500 md:text-right">
          Only scan code you own or are authorized to test. &copy; {new Date().getFullYear()} Threat Modeler.
        </p>
      </div>
    </footer>
  );
}
