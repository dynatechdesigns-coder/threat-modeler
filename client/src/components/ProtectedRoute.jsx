import { useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { selectCurrentUser, selectToken } from '../features/auth/authSlice.js';
import { useGetMeQuery } from '../features/auth/authApi.js';

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const token = useSelector(selectToken);
  const user = useSelector(selectCurrentUser);

  // After a page refresh we have a token but no user yet, so load it.
  // (Right after login the user is already in the store, so this is skipped.)
  const { isLoading, isError, refetch } = useGetMeQuery(undefined, { skip: !token || Boolean(user) });

  if (!token) return <Navigate to="/login" replace state={{ from: location }} />;

  if (!user && isError) {
    // A 401 clears the token and redirects above. Anything else is likely a network problem.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-slate-400">Could not reach the server.</p>
        <button className="btn-ghost" onClick={refetch}>Retry</button>
      </div>
    );
  }

  if (!user || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  return children;
}
