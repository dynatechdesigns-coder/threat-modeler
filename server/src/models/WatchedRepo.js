import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  sha: { type: String, default: '' },
  message: { type: String, default: '' },
  author: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  status: { type: String, enum: ['scanning', 'baseline', 'ok', 'warning', 'failed', 'skipped'], default: 'scanning' },
  reason: { type: String, default: '' },
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'ScanReport' },
  previousReport: { type: mongoose.Schema.Types.ObjectId, ref: 'ScanReport' },
  newCount: { type: Number, default: 0 },
  newSevere: { type: Number, default: 0 },
  fixedCount: { type: Number, default: 0 },
  riskScore: { type: Number, default: 0 },
  newTitles: [String],
});

// A public GitHub repository whose pushes are scanned automatically.
const watchedRepoSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    owner: { type: String, required: true },
    repo: { type: String, required: true },
    branch: { type: String, default: '' }, // empty = the repository's default branch
    webhookId: { type: String, required: true, unique: true }, // the secret part of the webhook address
    secret: { type: String, required: true }, // used to check GitHub's signature on every delivery
    badgeToken: { type: String, index: true, sparse: true }, // set when the owner switches the public README badge on
    lastReport: { type: mongoose.Schema.Types.ObjectId, ref: 'ScanReport' },
    events: [eventSchema],
  },
  { timestamps: true }
);

// The signing secret is only ever sent from the dedicated setup endpoint.
watchedRepoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.secret;
    delete ret.webhookId;
    ret.badgeOn = Boolean(ret.badgeToken);
    delete ret.badgeToken;
    return ret;
  },
});

export const WatchedRepo = mongoose.model('WatchedRepo', watchedRepoSchema);
