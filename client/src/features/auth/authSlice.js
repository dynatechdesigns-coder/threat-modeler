import { createSlice } from '@reduxjs/toolkit';
import { authApi } from './authApi.js';

export const TOKEN_KEY = 'tm_token';

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

const authSlice = createSlice({
  name: 'auth',
  initialState: { token: readToken(), user: null },
  reducers: {
    logout(state) {
      state.token = null;
      state.user = null;
    },
  },
  extraReducers: (builder) => {
    const onAuthenticated = (state, { payload }) => {
      state.token = payload.token;
      state.user = payload.user;
    };
    builder
      .addMatcher(authApi.endpoints.login.matchFulfilled, onAuthenticated)
      .addMatcher(authApi.endpoints.register.matchFulfilled, onAuthenticated)
      .addMatcher(authApi.endpoints.googleLogin.matchFulfilled, onAuthenticated)
      .addMatcher(authApi.endpoints.getMe.matchFulfilled, (state, { payload }) => {
        state.user = payload.user;
      })
      .addMatcher(authApi.endpoints.updatePreferences.matchFulfilled, (state, { payload }) => {
        state.user = payload.user;
      });
  },
});

export const { logout } = authSlice.actions;
export const selectToken = (state) => state.auth.token;
export const selectCurrentUser = (state) => state.auth.user;

export default authSlice.reducer;
