import { env } from '../config/env.js';
import { sendEmail, isConfigured } from './email.js';

// The server's own email settings, bound once. Everything else imports from here.
export const emailConfigured = () => isConfigured(env);
export const send = (message) => sendEmail(message, { config: env });
export const appUrl = () => env.appUrl || env.clientOrigins[0] || 'http://localhost:5173';
