import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    key: { type: String, required: true }, // storage key (R2 object key or local path key)
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: 'application/octet-stream' },
    storage: { type: String, enum: ['r2', 'local'], default: 'local' },
  },
  { _id: true }
);

const findingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    severity: { type: String, enum: ['critical', 'high', 'medium', 'low'], required: true },
    category: { type: String, default: 'General' },
    description: { type: String, default: '' },
    file: { type: String, default: '' },
    line: { type: Number },
    cwe: { type: String, default: '' },
    recommendation: { type: String, default: '' },
    snippet: { type: String, default: '' },
    source: { type: String, enum: ['rule', 'ai', 'osv'] },
  },
  { _id: true }
);

const aiSummarySchema = new mongoose.Schema(
  {
    text: { type: String, default: '' },
    source: { type: String, enum: ['ai', 'rules'], default: 'rules' },
    priorities: [
      new mongoose.Schema(
        { title: String, why: String, action: String },
        { _id: false }
      ),
    ],
  },
  { _id: false }
);

const scanReportSchema = new mongoose.Schema(
  {
    // Optional: anonymous judge-demo reports have no account. Every other
    // flow always sets this, so ownership scoping elsewhere is unaffected.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    status: {
      type: String,
      enum: ['uploaded', 'running', 'completed', 'failed'],
      default: 'uploaded',
      index: true,
    },
    files: [fileSchema],
    findings: [findingSchema],
    summary: {
      critical: { type: Number, default: 0 },
      high: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    riskScore: { type: Number, default: 0 },
    aiSummary: aiSummarySchema,
    resultData: { type: mongoose.Schema.Types.Mixed, default: undefined },
    logs: [String],
    origin: {
      kind: { type: String, enum: ['upload', 'github', 'demo', 'ci'] }, // where the code came from (missing = upload)
      owner: String,
      repo: String,
      branch: String,
      private: Boolean,
      role: { type: String, enum: ['baseline', 'pr'] }, // CI only: a scan of the main branch, or of a change under review
      sha: String,
    },
    shareToken: { type: String, unique: true, sparse: true }, // set while a read-only public link is switched on
    // TTL for ownerless judge-demo reports (authenticated reports leave this
    // unset, so they never expire). Set at creation; MongoDB deletes the
    // document once the date passes.
    expiresAt: { type: Date, default: undefined },
    filesDeleted: { type: Boolean, default: false }, // raw uploads removed from storage after the scan
    error: { type: String },
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true }
);

// Ownerless demo reports auto-delete 7 days after creation (expiresAt is only
// ever set on demo-origin reports). expireAfterSeconds 0 deletes exactly at
// the stored date, not after an additional delay.
scanReportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

scanReportSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const ScanReport = mongoose.model('ScanReport', scanReportSchema);
