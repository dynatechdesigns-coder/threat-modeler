import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

// The centred card used by the sign-in related pages.
export default function AuthCard({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-cyan-300">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      </div>
      <div className="card w-full max-w-sm p-8">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <ShieldAlert className="h-7 w-7 text-cyan-400" />
          <span className="text-xl font-semibold text-white">Threat Modeler</span>
        </Link>
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        {subtitle && <p className="mt-1 mb-6 text-sm text-slate-400">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
