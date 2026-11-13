import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimits.js';
import webhookRoutes from './routes/webhook.routes.js';

const app = express();

// Behind a host's proxy (Render, Railway...) the real visitor IP is in X-Forwarded-For. Needed for rate limits.
if (env.isProd) app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    // Only the frontend addresses in CLIENT_ORIGIN may call the API from a browser.
    origin: (origin, cb) => cb(null, !origin || env.clientOrigins.includes(origin)),
    credentials: true,
  })
);
// GitHub webhooks need the raw request bytes to check their signature, so they are mounted BEFORE the JSON parser.
app.use('/api/webhooks', webhookRoutes);

app.use(express.json({ limit: '1mb' }));
if (!env.isProd) app.use(morgan('dev'));

app.use('/api', apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

export default app;
