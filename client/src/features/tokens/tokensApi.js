import { apiSlice } from '../api/apiSlice.js';

const TAG = { type: 'Token', id: 'LIST' };

export const tokensApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getTokens: builder.query({
      query: () => '/tokens',
      transformResponse: (res) => res.tokens,
      providesTags: [TAG],
    }),
    // Returns { token, record }. The token is shown once and cannot be fetched again.
    createToken: builder.mutation({
      query: (body) => ({ url: '/tokens', method: 'POST', body }),
      invalidatesTags: [TAG],
    }),
    deleteToken: builder.mutation({
      query: (id) => ({ url: `/tokens/${id}`, method: 'DELETE' }),
      invalidatesTags: [TAG],
    }),
  }),
});

export const { useGetTokensQuery, useCreateTokenMutation, useDeleteTokenMutation } = tokensApi;
