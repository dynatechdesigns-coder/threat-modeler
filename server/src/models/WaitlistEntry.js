import mongoose from 'mongoose';

const waitlistEntrySchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    source: { type: String, default: 'landing', maxlength: 40 },
  },
  { timestamps: true }
);

export const WaitlistEntry = mongoose.model('WaitlistEntry', waitlistEntrySchema);
