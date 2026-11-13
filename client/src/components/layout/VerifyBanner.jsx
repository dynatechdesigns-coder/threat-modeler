import { useState } from 'react';
import { useSelector } from 'react-redux';
import { MailWarning } from 'lucide-react';
import { selectCurrentUser } from '../../features/auth/authSlice.js';
import { useResendVerificationMutation } from '../../features/auth/authApi.js';
import { getErrorMessage } from '../../lib/errors.js';

// Shown to signed-in people whose email is not confirmed yet, but only when this server can actually send email.
export default function VerifyBanner() {
  const user = useSelector(selectCurrentUser);
  const [resend, { isLoading }] = useResendVerificationMutation();
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);

  if (!user || !user.emailAvailable || user.emailVerified !== false) return null;

  const send = async () => {
    setNote('');
    setFailed(false);
    try {
      await resend().unwrap();
      setNote('Sent. Check your inbox (and spam).');
    } catch (err) {
      setFailed(true);
      setNote(getErrorMessage(err));
    }
  };

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100">
      <MailWarning className="h-4 w-4 shrink-0" />
      <span>Please confirm your email address ({user.email}).</span>
      <button onClick={send} disabled={isLoading} className="font-medium underline hover:text-white disabled:opacity-60">
        {isLoading ? 'Sending...' : 'Send the link again'}
      </button>
      {note && <span className={failed ? 'text-red-300' : 'text-emerald-300'}>{note}</span>}
    </div>
  );
}
