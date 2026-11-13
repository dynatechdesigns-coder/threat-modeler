import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { ScanReport } from './models/ScanReport.js';
import { failInterruptedPushScans } from './services/watchRunner.js';

// Trust proxy setting for Render rate-limiter
app.set('trust proxy', 1);

async function start() {
  await connectDB();

  // Scans run inside this process, so any scan still marked "running" at startup was killed by a restart.
  // (With several server instances you would move scans to a queue instead.)
  const stale = await ScanReport.updateMany(
    { status: 'running' },
    { $set: { status: 'failed', error: 'The server restarted while this scan was running. Please scan again.', completedAt: new Date() } }
  );
  if (stale.modifiedCount) console.log(`Marked ${stale.modifiedCount} interrupted scan(s) as failed`);

  const stalePush = await failInterruptedPushScans();
  if (stalePush) console.log(`Marked ${stalePush} interrupted push scan(s) as failed`);

  const server = app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
