import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { productionProblems, parseOrigins } from './envChecks.js';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

// No hardcoded fallback secret. In development a random one is made per start (set JWT_SECRET to stay logged in).
const jwtSecretFromEnv = process.env.JWT_SECRET || '';
const jwtSecret = jwtSecretFromEnv || (isProd ? '' : crypto.randomBytes(32).toString('hex'));


const AI_KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY || '',
  openai: process.env.OPENAI_API_KEY || '',
  gemini: process.env.GEMINI_API_KEY || '',
};
// AI_PROVIDER wins; otherwise use whichever provider has a key set.
const aiProvider = (
  process.env.AI_PROVIDER ||
  (AI_KEYS.anthropic ? 'anthropic' : AI_KEYS.openai ? 'openai' : AI_KEYS.gemini ? 'gemini' : 'anthropic')
).toLowerCase();
if (!(aiProvider in AI_KEYS)) throw new Error('AI_PROVIDER must be one of: anthropic, openai, gemini');

export const env = {
  nodeEnv,
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/threat-modeler',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins: parseOrigins(process.env.CLIENT_ORIGIN || 'http://localhost:5173'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 25,
  scannerProvider: process.env.SCANNER_PROVIDER || 'agent',
  osvEnabled: process.env.OSV_ENABLED !== 'false',
  scanIncludeTests: process.env.SCAN_INCLUDE_TESTS === 'true',
  deleteUploadsAfterScan: process.env.DELETE_UPLOADS_AFTER_SCAN !== 'false',
  publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/+$/, ''),
  // Email (Brevo). Optional: without a key, the email features switch themselves off.
  appUrl: (process.env.APP_URL || '').replace(/\/+$/, ''),
  brevoApiKey: process.env.BREVO_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  emailFromName: process.env.EMAIL_FROM_NAME || 'Threat Modeler',
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // Paid plans (Paystack). With BILLING_ENABLED unset, everyone gets the Team limits (early access) and nothing is enforced.
  billing: {
    enabled: process.env.BILLING_ENABLED === 'true',
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    planCodes: {
      pro_monthly: process.env.PAYSTACK_PLAN_PRO_MONTHLY || '',
      pro_annual: process.env.PAYSTACK_PLAN_PRO_ANNUAL || '',
      team_monthly: process.env.PAYSTACK_PLAN_TEAM_MONTHLY || '',
      team_annual: process.env.PAYSTACK_PLAN_TEAM_ANNUAL || '',
    },
  },
  safeBrowsingKey: process.env.SAFE_BROWSING_API_KEY || '',
  ai: {
    provider: aiProvider,
    apiKey: AI_KEYS[aiProvider],
    model: process.env.AI_MODEL || (aiProvider === 'anthropic' ? process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5' : ''),
    baseUrl: process.env.AI_BASE_URL || '',
    maxChars: Number(process.env.AI_MAX_CHARS) || 150000,
    maxBatches: Number(process.env.AI_MAX_BATCHES) || 4,
    timeoutSeconds: Number(process.env.AI_TIMEOUT_SECONDS) || 30,
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || '',
  },
};

if (!jwtSecretFromEnv && !isProd) {
  console.warn('[warn] JWT_SECRET is not set, so a temporary one is used. You will be logged out whenever the server restarts.');
}

if (isProd) {
  const problems = productionProblems({
    jwtSecret,
    mongoUriFromEnv: Boolean(process.env.MONGODB_URI),
    clientOriginFromEnv: Boolean(process.env.CLIENT_ORIGIN),
    clientOrigins: env.clientOrigins,
  });
  if (problems.length) throw new Error(`Unsafe production configuration:\n- ${problems.join('\n- ')}`);
}
