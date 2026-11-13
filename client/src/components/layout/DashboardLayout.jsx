import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, ShieldAlert } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import VerifyBanner from './VerifyBanner.jsx';

export default function DashboardLayout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 md:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative h-full w-64">
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="md:pl-64">
        <OfflineBanner />
        <VerifyBanner />
        <header className="flex h-14 items-center gap-3 border-b border-slate-800 px-4 md:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-slate-300">
            <Menu className="h-5 w-5" />
          </button>
          <ShieldAlert className="h-5 w-5 text-cyan-400" />
          <span className="font-semibold text-white">Threat Modeler</span>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
