import { apiSlice } from '../api/apiSlice.js';

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: ({ email, password }) => ({ url: '/auth/login', method: 'POST', body: { email, password } }),
    }),
    register: builder.mutation({
      query: ({ name, email, password }) => ({
        url: '/auth/register',
        method: 'POST',
        body: { name, email, password },
      }),
    }),
    googleLogin: builder.mutation({
      query: (credential) => ({ url: '/auth/google', method: 'POST', body: { credential } }),
    }),
    forgotPassword: builder.mutation({
      query: (email) => ({ url: '/auth/forgot-password', method: 'POST', body: { email } }),
    }),
    resetPassword: builder.mutation({
      query: ({ token, password }) => ({ url: '/auth/reset-password', method: 'POST', body: { token, password } }),
    }),
    verifyEmail: builder.mutation({
      query: (token) => ({ url: '/auth/verify-email', method: 'POST', body: { token } }),
    }),
    resendVerification: builder.mutation({
      query: () => ({ url: '/auth/resend-verification', method: 'POST' }),
    }),
    updatePreferences: builder.mutation({
      query: (body) => ({ url: '/auth/preferences', method: 'PATCH', body }),
    }),
    getMe: builder.query({
      query: () => '/auth/me',
      providesTags: ['User'],
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useGoogleLoginMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useUpdatePreferencesMutation,
} = authApi;
