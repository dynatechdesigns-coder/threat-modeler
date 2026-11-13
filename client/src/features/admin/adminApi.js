import { apiSlice } from '../api/apiSlice.js';

export const adminApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // GET /admin/stats (admins only)
    getAdminStats: builder.query({ query: () => '/admin/stats' }),
  }),
});

export const { useGetAdminStatsQuery } = adminApi;
