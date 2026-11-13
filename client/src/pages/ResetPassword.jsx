import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useResetPasswordMutation } from '../features/auth/authApi.js';
import { getErrorMessage } from '../lib/errors.js';
import AuthCard from '../components/auth/AuthCard.jsx';
import PasswordInput from '../components/ui/PasswordInput.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [reset, { isLoading }] = useResetPasswordMutation();

  // Take the one-time token out of the address bar so it is not left in the browser history.
  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('The two passwords do not match');
    try {
      await reset({ token, password }).unwrap();
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (!token) {
    return (
      <AuthCard title="Link not valid">
        <p className="text-sm text-slate-400">This reset link is missing its code. Open the link from your email again, or ask for a new one.</p>
        <Link to="/forgot-password" className="btn-primary mt-5 w-full">
          Ask for a new link
        </Link>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password changed">
        <p className="flex gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Your password was changed and all other devices were signed out. You can sign in now.</span>
        </p>
        <Link to="/login" className="btn-primary mt-5 w-full">
          Sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="Use at least 8 characters.">
      <form onSubmit={submit} className="space-y-4">
        <PasswordInput
          placeholder="New password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          maxLength={72}
          required
        />
        <PasswordInput
          placeholder="Repeat the new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          maxLength={72}
          required
        />
        {error && (
          <p className="text-sm text-red-400">
            {error}{' '}
            {/expired|already used/.test(error) && (
              <Link to="/forgot-password" className="underline">
                Ask for a new link
              </Link>
            )}
          </p>
        )}
        <button className="btn-primary w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Change password
        </button>
      </form>
    </AuthCard>
  );
}
