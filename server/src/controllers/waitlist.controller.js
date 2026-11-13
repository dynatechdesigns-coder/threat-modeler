import { WaitlistEntry } from '../models/WaitlistEntry.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import { emailConfigured, send } from '../services/mailer.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const joinWaitlist = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new ApiError(400, 'Please enter a valid email address');
  }

  try {
    await WaitlistEntry.create({ email, source: String(req.body.source || 'landing').slice(0, 40) });
  } catch (err) {
    // Already signed up: respond with success so the form behaves the same either way.
    if (err.code === 11000) {
      return res.json({ success: true, message: "You're already on the list. We'll be in touch." });
    }
    throw err;
  }

  // Tell the admins. Fire and forget: a failed email must never stop someone joining.
  if (emailConfigured() && env.adminEmails.length) {
    for (const to of env.adminEmails) {
      send({
        to,
        subject: 'New Threat Modeler waitlist signup',
        text: `${email} just joined the waitlist.`,
        html: `<p><strong>${email.replace(/[<>&]/g, '')}</strong> just joined the Threat Modeler waitlist.</p>`,
      }).catch((err) => console.error('Waitlist alert failed:', err.message));
    }
  }

  res.status(201).json({ success: true, message: "You're on the list! We'll email you when access opens." });
});
