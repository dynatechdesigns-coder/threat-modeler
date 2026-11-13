import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { selectToken } from '../features/auth/authSlice.js';
import { useGoogleLoginMutation, useLoginMutation, useRegisterMutation } from '../features/auth/authApi.js';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import GoogleButton, { googleSignInEnabled } from '../components/auth/GoogleButton.jsx';
import { getErrorMessage } from '../lib/errors.js';

export default function Login() {
  const token = useSelector(selectToken);
  const navigate = useNavigate();
  // After signing in, go back to the page the person was heading to (for example Plan and billing), else the dashboard.
  const from = useLocation().state?.from;
  const dest =
    typeof from?.pathname === 'string' && from.pathname.startsWith('/') && !from.pathname.startsWith('//')
      ? `${from.pathname}${from.search || ''}`
      : '/dashboard';
  const [login, { isLoading: loggingIn }] = useLoginMutation();
  const [register, { isLoading: registering }] = useRegisterMutation();
  const [googleLogin, { isLoading: googling }] = useGoogleLoginMutation();

  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const busy = loggingIn || registering || googling;

  if (token) return <Navigate to={dest} replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'login') {
        await login({ email: form.email, password: form.password }).unwrap();
      } else {
        await register({ name: form.name, email: form.email, password: form.password }).unwrap();
      }
      navigate(dest, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const onGoogle = async (credential) => {
    setError('');
    try {
      await googleLogin(credential).unwrap();
      navigate(dest, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

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
          <h1 className="text-xl font-semibold text-white">Threat Modeler</h1>
        </Link>
        <p className="mb-6 text-sm text-slate-400">
          {mode === 'login' ? 'Sign in to your workspace.' : 'Create your account.'}
        </p>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <input className="input" placeholder="Full name" value={form.name} onChange={set('name')} required />
          )}
          <input className="input" type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
          <PasswordInput
            placeholder="Password (min 8 characters)"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={form.password}
            onChange={set('password')}
            minLength={8}
            maxLength={72}
            required
          />
          {mode === 'login' && (
            <Link to="/forgot-password" className="block text-right text-xs text-slate-400 hover:text-cyan-300">
              Forgot password?
            </Link>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        
          <button
            type="button"
            className="btn-ghost w-full mt-2 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-900/30"
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              setError('');
              try {
                await login({ email: 'judge@hackathon.com', password: 'demo1234' }).unwrap();
                navigate(dest, { replace: true });
              } catch (err) {
                setError(getErrorMessage(err));
              }
            }}
          >
            Log in as Hackathon Judge
          </button>
        </form>

        {googleSignInEnabled && (
          <div className="mt-5">
            <div className="mb-4 flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-slate-800" />
              or
              <span className="h-px flex-1 bg-slate-800" />
            </div>
            <GoogleButton onCredential={onGoogle} onError={setError} />
          </div>
        )}

        <button
          className="mt-5 w-full text-center text-sm text-slate-400 hover:text-cyan-300"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
