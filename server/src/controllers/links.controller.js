import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { checkLinks } from '../services/links/index.js';

const MAX_CHARS = 10000;

// Nothing is saved: the text is checked and thrown away. The links are never opened.
export const checkLinksHandler = asyncHandler(async (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) throw new ApiError(400, 'Paste a link or a message to check');
  if (text.length > MAX_CHARS) throw new ApiError(400, `That is too long. The limit is ${MAX_CHARS.toLocaleString()} characters`);

  res.json(await checkLinks({ text, safeBrowsingKey: env.safeBrowsingKey }));
});
