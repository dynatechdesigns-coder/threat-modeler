import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL || '/api',
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.token;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

// Wraps the base query so an expired/invalid token logs the user out everywhere.
// The plain action type string avoids a circular import with authSlice.
const AUTH_ENDPOINTS = ['login', 'register'];

const baseQueryWithAuth = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401 && !AUTH_ENDPOINTS.includes(api.endpoint)) {
    api.dispatch({ type: 'auth/logout' });
  }
  return result;
};

// One API slice for the whole app. Feature files add endpoints with injectEndpoints.
export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['User', 'Scan', 'Watch', 'Token', 'Billing'],
  endpoints: () => ({}),
});
