import { apiSlice } from '../api/apiSlice.js';

const LIST_TAG = { type: 'Scan', id: 'LIST' };

export const scansApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // GET /scans (summaries only, no findings)
    getScans: builder.query({
      query: () => '/scans',
      transformResponse: (res) => res.reports,
      providesTags: (result) => [
        LIST_TAG,
        ...(result || []).map(({ _id }) => ({ type: 'Scan', id: _id })),
      ],
    }),

    // GET /scans/:id (full report with findings). Poll this while a scan is running.
    getScan: builder.query({
      query: (id) => `/scans/${id}`,
      transformResponse: (res) => res.report,
      providesTags: (_result, _error, id) => [{ type: 'Scan', id }],
    }),

    // POST /uploads (multipart). Creates a report with status "uploaded".
    uploadFiles: builder.mutation({
      query: ({ files, name }) => {
        const body = new FormData();
        files.forEach((file) => body.append('files', file));
        if (name) body.append('name', name);
        return { url: '/uploads', method: 'POST', body };
      },
      transformResponse: (res) => res.report,
      invalidatesTags: [LIST_TAG],
    }),

    // POST /scans/:id/share and DELETE /scans/:id/share: switch the public read-only link on or off.
    enableShare: builder.mutation({
      query: (id) => ({ url: `/scans/${id}/share`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Scan', id }],
    }),
    disableShare: builder.mutation({
      query: (id) => ({ url: `/scans/${id}/share`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Scan', id }],
    }),

    // POST /scans/:id/rescan. Scans the same demo or public repository again.
    rescan: builder.mutation({
      query: (id) => ({ url: `/scans/${id}/rescan`, method: 'POST' }),
      transformResponse: (res) => res.report,
      invalidatesTags: [LIST_TAG],
    }),

    // GET /public/reports/:token (no sign-in needed)
    getSharedReport: builder.query({
      query: (token) => `/public/reports/${token}`,
      transformResponse: (res) => res.report,
    }),

    // POST /scans/demo. Scans a small built-in vulnerable project.
    scanDemo: builder.mutation({
      query: () => ({ url: '/scans/demo', method: 'POST' }),
      transformResponse: (res) => res.report,
      invalidatesTags: [LIST_TAG],
    }),

    // POST /scans/github. The server downloads a public repository and starts the scan.
    scanGithub: builder.mutation({
      query: ({ url, name, token }) => ({ url: '/scans/github', method: 'POST', body: { url, name, token } }),
      transformResponse: (res) => res.report,
      invalidatesTags: [LIST_TAG],
    }),

    // POST /scans/:id/trigger
    triggerScan: builder.mutation({
      query: (id) => ({ url: `/scans/${id}/trigger`, method: 'POST' }),
      transformResponse: (res) => res.report,
      invalidatesTags: (_result, _error, id) => [{ type: 'Scan', id }, LIST_TAG],
    }),

    // POST /scans/:id/remediate. Asks Gemini for a minimal patch of one finding.
    // Returns { findingId, patchedCode, explanation } — nothing stored server-side.
    remediate: builder.mutation({
      query: ({ id, findingId }) => ({ url: `/scans/${id}/remediate`, method: 'POST', body: { findingId } }),
    }),

    // DELETE /scans/:id
    deleteScan: builder.mutation({
      query: (id) => ({ url: `/scans/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Scan', id }, LIST_TAG],
    }),
  }),
});

export const {
  useGetScansQuery,
  useGetScanQuery,
  useUploadFilesMutation,
  useTriggerScanMutation,
  useRemediateMutation,
  useScanGithubMutation,
  useScanDemoMutation, useRescanMutation,
  useEnableShareMutation,
  useDisableShareMutation,
  useGetSharedReportQuery,
  useDeleteScanMutation,
} = scansApi;
