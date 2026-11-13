import { apiSlice } from '../api/apiSlice.js';

export const headersApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // POST /headers/check. The server reads only the response headers of the page.
    checkHeaders: builder.mutation({
      query: (url) => ({ url: '/headers/check', method: 'POST', body: { url } }),
      transformResponse: (res) => res.result,
    }),
  }),
});

export const { useCheckHeadersMutation } = headersApi;
