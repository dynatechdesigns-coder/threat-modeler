import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useLazyGetMeQuery, useVerifyEmailMutation } from '../features/auth/authApi.js';
import { selectToken } from '../features/auth/authSlice.js';
import { getErrorMessage } from '../lib/errors.js';
import AuthCard from '../components/auth/AuthCard.jsx';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') || '');
  const signedIn = Boolean(useSelector(selectToken));
  const [verify] = useVerifyEmailMutation();
  const [refreshMe] = useLazyGetMeQuery();
  const [state, setState] = useState({ status: 'working', message: '' });
  const started = useRef(false);

  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (started.current) return; // React runs effects twice in development, and a token works only once
    started.current = true;

    verify(token)
      .unwrap()
      .then(() => {
        setState({ status: 'ok', message: '' });
        if (signedIn) refreshMe();
      })
      .catch((err) => setState({ status: 'error', message: getErrorMessage(err) }));
  }, [token, verify, refreshMe, signedIn]);

  return (
    <AuthCard title="Confirming your email">
      {state.status === 'working' && (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> One moment...
        </p>
      )}
      {state.status === 'ok' && (
        <p className="flex gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Your email is confirmed. Thank you.</span>
        </p>
      )}
      {state.status === 'error' && (
        <p className="flex gap-2 text-sm text-red-300">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.message}</span>
        </p>
      )}
      {state.status !== 'working' && (
        <Link to={signedIn ? '/dashboard' : '/login'} className="btn-primary mt-5 w-full">
          {signedIn ? 'Go to dashboard' : 'Sign in'}
        </Link>
      )}
    </AuthCard>
  );
}
