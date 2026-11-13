import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MailCheck } from 'lucide-react';
import { useForgotPasswordMutation } from '../features/auth/authApi.js';
import { getErrorMessage } from '../lib/errors.js';
import AuthCard from '../components/auth/AuthCard.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [forgot, { isLoading }] = useForgotPasswordMutation();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await forgot(email.trim()).unwrap();
      setSent(res.message);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <AuthCard title="Forgot your password?" subtitle="Enter your email and we will send you a link to choose a new one.">
      {sent ? (
        <div className="space-y-4">
          <p className="flex gap-2 text-sm text-emerald-300">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{sent}</span>
          </p>
          <p className="text-xs text-slate-500">Nothing in your inbox? Check the spam folder, and wait a minute or two.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="btn-primary w-full" disabled={isLoading || !email.trim()}>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            Send reset link
          </button>
        </form>
      )}
      <Link to="/login" className="mt-6 block text-center text-sm text-slate-400 hover:text-cyan-300">
        Back to sign in
      </Link>
    </AuthCard>
  );
}
