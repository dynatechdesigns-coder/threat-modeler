import { apiSlice } from '../api/apiSlice.js';

export const linksApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // POST /links/check. Nothing is saved on the server and the links are never opened.
    checkLinks: builder.mutation({
      query: (text) => ({ url: '/links/check', method: 'POST', body: { text } }),
    }),
  }),
});

export const { useCheckLinksMutation } = linksApi;
