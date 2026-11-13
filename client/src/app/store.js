import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { apiSlice } from '../features/api/apiSlice.js';
import authReducer, { logout, TOKEN_KEY } from '../features/auth/authSlice.js';

// When the user logs out (or the token expires) wipe the whole RTK Query cache,
// so the next person to sign in never sees someone else's data.
const listener = createListenerMiddleware();
listener.startListening({
  actionCreator: logout,
  effect: (_action, api) => {
    api.dispatch(apiSlice.util.resetApiState());
  },
});

export const store = configureStore({
  reducer: {
    [apiSlice.reducerPath]: apiSlice.reducer,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listener.middleware).concat(apiSlice.middleware),
});

// Enables refetchOnFocus / refetchOnReconnect.
setupListeners(store.dispatch);

// Keep the token in localStorage so sessions survive a page refresh.
let lastToken = store.getState().auth.token;
store.subscribe(() => {
  const token = store.getState().auth.token;
  if (token === lastToken) return;
  lastToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode); session just won't persist
  }
});
