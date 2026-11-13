import { apiSlice } from '../api/apiSlice.js';

export const waitlistApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    joinWaitlist: builder.mutation({
      query: ({ email, source }) => ({ url: '/waitlist', method: 'POST', body: { email, source } }),
    }),
  }),
});

export const { useJoinWaitlistMutation } = waitlistApi;
