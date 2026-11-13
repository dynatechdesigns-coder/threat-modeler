import { apiSlice } from '../api/apiSlice.js';

const TAG = { type: 'Watch', id: 'LIST' };

export const watchApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getWatches: builder.query({
      query: () => '/watches',
      transformResponse: (res) => res.watches,
      providesTags: [TAG],
    }),
    // Returns { watch, setup: { url, secret } }. The secret is shown so it can be pasted into GitHub.
    createWatch: builder.mutation({
      query: (body) => ({ url: '/watches', method: 'POST', body }),
      invalidatesTags: [TAG],
    }),
    getWatchSetup: builder.query({
      query: (id) => `/watches/${id}/setup`,
      transformResponse: (res) => res.setup,
      keepUnusedDataFor: 0,
    }),
    // The public README badge for a watched repository (null when it is switched off).
    getBadge: builder.query({
      query: (id) => `/watches/${id}/badge`,
      transformResponse: (res) => res.badge,
      providesTags: (_r, _e, id) => [{ type: 'Watch', id: `badge-${id}` }],
    }),
    enableBadge: builder.mutation({
      query: (id) => ({ url: `/watches/${id}/badge`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Watch', id: `badge-${id}` }, TAG],
    }),
    disableBadge: builder.mutation({
      query: (id) => ({ url: `/watches/${id}/badge`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Watch', id: `badge-${id}` }, TAG],
    }),
    deleteWatch: builder.mutation({
      query: (id) => ({ url: `/watches/${id}`, method: 'DELETE' }),
      invalidatesTags: [TAG],
    }),
  }),
});

export const {
  useGetWatchesQuery,
  useCreateWatchMutation,
  useLazyGetWatchSetupQuery,
  useDeleteWatchMutation,
  useGetBadgeQuery,
  useEnableBadgeMutation,
  useDisableBadgeMutation,
} = watchApi;
