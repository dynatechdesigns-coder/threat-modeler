import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { fetchHeaders, HeaderFetchError } from '../services/headers/fetcher.js';
import { analyzeHeaders } from '../services/headers/analyze.js';

/** POST /api/headers/check { url }. Looks only at the response headers of the page, never at its content. */
export const checkHeadersHandler = asyncHandler(async (req, res) => {
  try {
    const fetched = await fetchHeaders(req.body?.url);
    res.json({ result: analyzeHeaders(fetched) });
  } catch (err) {
    if (err instanceof HeaderFetchError) throw new ApiError(err.status, err.message);
    throw err;
  }
});
