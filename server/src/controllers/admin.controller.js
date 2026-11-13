import { User } from '../models/User.js';
import { ScanReport } from '../models/ScanReport.js';
import { WatchedRepo } from '../models/WatchedRepo.js';
import { WaitlistEntry } from '../models/WaitlistEntry.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

/** GET /api/admin/stats: simple numbers about how the app is being used. No private code or findings are read. */
export const stats = asyncHandler(async (_req, res) => {
  const [users, usersWeek, usersVerified, scans, scans24h, scansWeek, byStatus, failed, categories, watches, shared, waitTotal, waitWeek, waitRecent] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: daysAgo(7) } }),
    User.countDocuments({ emailVerified: true }),
    ScanReport.countDocuments(),
    ScanReport.countDocuments({ createdAt: { $gte: daysAgo(1) } }),
    ScanReport.countDocuments({ createdAt: { $gte: daysAgo(7) } }),
    ScanReport.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ScanReport.find({ status: 'failed' }).sort({ completedAt: -1 }).limit(8).select('name error completedAt createdAt').lean(),
    // The kinds of problems found most often in the last 30 days (counts only, never the code or file names).
    ScanReport.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: daysAgo(30) } } },
      { $unwind: '$findings' },
      { $group: { _id: '$findings.category', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 8 },
    ]),
    WatchedRepo.countDocuments(),
    ScanReport.countDocuments({ shareToken: { $exists: true } }),
    WaitlistEntry.countDocuments(),
    WaitlistEntry.countDocuments({ createdAt: { $gte: daysAgo(7) } }),
    WaitlistEntry.find().sort({ createdAt: -1 }).limit(15).select('email createdAt').lean(),
  ]);

  res.json({
    users: { total: users, lastWeek: usersWeek, verified: usersVerified },
    scans: {
      total: scans,
      last24h: scans24h,
      lastWeek: scansWeek,
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
    },
    failedRecent: failed.map((f) => ({ name: f.name, error: f.error || '', at: f.completedAt || f.createdAt })),
    topCategories: categories.map((c) => ({ category: c._id || 'Other', count: c.n })),
    watchedRepos: watches,
    sharedReports: shared,
    waitlist: { total: waitTotal, lastWeek: waitWeek, recent: waitRecent.map((w) => ({ email: w.email, at: w.createdAt })) },
  });
});
