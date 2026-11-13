import { ScanReport } from '../models/ScanReport.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isShareToken, publicReport } from '../services/share.js';
import { WatchedRepo } from '../models/WatchedRepo.js';
import { badgeFor, renderBadge } from '../services/badge.js';

/** GET /api/public/reports/:token (no sign-in). */
export const getSharedReport = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const report = isShareToken(token) ? await ScanReport.findOne({ shareToken: token, status: 'completed' }) : null;
  if (!report) throw new ApiError(404, 'This link does not exist or was switched off');

  res.set('Cache-Control', 'private, no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.json({ report: publicReport(report) });
});

/** GET /api/public/badge/:token. A small image for a README. Shows only the latest risk number, nothing else. */
export const getBadge = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const watch = isShareToken(token) ? await WatchedRepo.findOne({ badgeToken: token }).select('events') : null;
  res.set({
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'X-Robots-Tag': 'noindex',
    'Cross-Origin-Resource-Policy': 'cross-origin', // helmet defaults to same-origin, which would block the image on GitHub
  });
  res.send(watch ? badgeFor(watch.events) : renderBadge({ value: 'not found', color: '#6e7781' }));
});
