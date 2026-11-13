import mongoose from 'mongoose';

const apiTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    hash: { type: String, required: true, unique: true }, // SHA-256 of the token; the token itself is never stored
    display: { type: String, required: true }, // tm_abcd...wxyz, so a person can tell tokens apart
    lastUsedAt: Date,
  },
  { timestamps: true }
);

apiTokenSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.hash;
    return ret;
  },
});

export const ApiToken = mongoose.model('ApiToken', apiTokenSchema);
