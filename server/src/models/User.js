import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    googleId: { type: String, index: true, sparse: true },
    password: {
      type: String,
      // Accounts created with Google sign-in have no password.
      required: [function needsPassword() { return !this.googleId; }, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    emailVerified: { type: Boolean, default: false },
    emailAlerts: { type: Boolean, default: true }, // scan-on-push warnings by email (only sent to verified addresses)
    verifyTokenHash: { type: String, select: false },
    verifyTokenExpires: { type: Date, select: false },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    passwordChangedAt: { type: Date }, // sign-in tokens issued before this moment stop working
    scanUsage: { month: { type: String }, count: { type: Number, default: 0 } }, // scans started in that month
    // Paid plan (Paystack). Access is judged from currentPeriodEnd, see services/plans.js.
    billing: {
      tier: { type: String, enum: ['pro', 'team'] },
      interval: { type: String, enum: ['monthly', 'annual'] },
      status: { type: String, enum: ['active', 'attention', 'non-renewing', 'cancelled'] },
      currentPeriodEnd: { type: Date },
      customerCode: { type: String, index: true, sparse: true },
      subscriptionCode: { type: String, index: true, sparse: true },
      lastReference: { type: String },
    },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.verifyTokenHash;
    delete ret.verifyTokenExpires;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpires;
    delete ret.scanUsage;
    if (ret.billing) {
      delete ret.billing.customerCode;
      delete ret.billing.subscriptionCode;
      delete ret.billing.lastReference;
    }
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
