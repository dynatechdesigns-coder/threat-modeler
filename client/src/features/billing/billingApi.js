import { apiSlice } from '../api/apiSlice.js';

const TAG = { type: 'Billing', id: 'ME' };

export const billingApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getBilling: builder.query({
      query: () => '/billing/me',
      providesTags: [TAG],
    }),
    startCheckout: builder.mutation({
      query: (body) => ({ url: '/billing/checkout', method: 'POST', body }),
    }),
    verifyCheckout: builder.mutation({
      query: (reference) => ({
        url: '/billing/verify',
        method: 'POST',
        body: { reference },
      }),
      invalidatesTags: [TAG],
    }),
    cancelPlan: builder.mutation({
      query: () => ({ url: '/billing/cancel', method: 'POST' }),
      invalidatesTags: [TAG],
    }),
  }),
});

export const { useGetBillingQuery, useStartCheckoutMutation, useVerifyCheckoutMutation, useCancelPlanMutation } =
  billingApi;
