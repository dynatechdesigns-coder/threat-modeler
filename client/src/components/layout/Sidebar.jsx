import { useDispatch, useSelector } from 'react-redux';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  UploadCloud,
  FileText,
  Link2,
  GitCompare,
  Eye,
  ShieldCheck,
  ShieldAlert,
  BarChart3,
  KeyRound,
  CreditCard,
  LogOut,
  X,
  Download,
} from 'lucide-react';
import { logout, selectCurrentUser } from '../../features/auth/authSlice.js';
import { useInstallPrompt } from '../../lib/pwa.js';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/vault', label: 'Code Vault', icon: UploadCloud },
  { to: '/links', label: 'Link Checker', icon: Link2 },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/compare', label: 'Compare scans', icon: GitCompare },
  { to: '/watch', label: 'Watched repos', icon: Eye },
  { to: '/headers', label: 'Security headers', icon: ShieldCheck },
  { to: '/tokens', label: 'CI and API tokens', icon: KeyRound },
  { to: '/billing', label: 'Plan and billing', icon: CreditCard },
  { to: '/reports/demo', label: 'Sample Report', icon: ShieldAlert },
];

export default function Sidebar({ onNavigate }) {
  const dispatch = useDispatch();
  const user = useSelector(selectCurrentUser);
  const { canInstall, install } = useInstallPrompt();

  return (
    <div className="flex h-full flex-col border-r border-slate-800 bg-slate-950">
      <div className="flex h-16 items-center justify-between px-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-cyan-400" />
          <span className="text-lg font-semibold text-white">Threat Modeler</span>
        </div>
        {onNavigate && (
          <button className="md:hidden text-slate-400" onClick={onNavigate} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {[...NAV, ...(user?.isAdmin ? [{ to: '/admin', label: 'Admin', icon: BarChart3 }] : [])].map(
          ({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ),
        )}
      </nav>

      <div className="border-t border-slate-800 p-4">
        {canInstall && (
          <button onClick={install} className="btn-ghost mb-4 w-full">
            <Download className="h-4 w-4" /> Install app
          </button>
        )}
        <p className="truncate text-sm font-medium text-slate-200">{user?.name}</p>
        <p className="truncate text-xs text-slate-500">{user?.email}</p>
        <button
          onClick={() => dispatch(logout())}
          className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-red-400"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
}
