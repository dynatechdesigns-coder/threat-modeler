import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../lib/pwa.js';

// Appears only while the device has no internet.
export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div role="status" className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
      <span>You are offline. The Link Checker still works. Scans, reports and sign-in need an internet connection.</span>
    </div>
  );
}
