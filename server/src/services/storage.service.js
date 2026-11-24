import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

const LOCAL_DIR = path.resolve(process.cwd(), 'uploads');

export const isR2Configured = () =>
  Boolean(env.r2.accountId && env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.bucket);

/**
 * Builds the S3-compatible endpoint for a Cloudflare R2 account.
 * R2_ACCOUNT_ID stays the bare account ID; jurisdiction is separate.
 * Buckets with EU jurisdiction reject the standard endpoint with
 * AccessDenied (403), so R2_JURISDICTION=eu selects the EU endpoint.
 * Anything else (unset, empty, unknown) keeps the standard endpoint,
 * preserving existing deployments.
 */
export function r2Endpoint(accountId, jurisdiction) {
  const id = String(accountId || '').trim();
  if (String(jurisdiction || '').trim().toLowerCase() === 'eu') {
    return `https://${id}.eu.r2.cloudflarestorage.com`;
  }
  return `https://${id}.r2.cloudflarestorage.com`;
}

let client;
function r2() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: r2Endpoint(env.r2.accountId, env.r2.jurisdiction),
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
    });
  }
  return client;
}

const safeName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

/**
 * Stores one uploaded file (multer memory file) and returns its metadata.
 * Uses Cloudflare R2 when configured, otherwise the local ./uploads folder.
 */
export async function saveFile(file, userId) {
  const key = `${userId}/${Date.now()}-${randomUUID()}-${safeName(file.originalname)}`;

  if (isR2Configured()) {
    await r2().send(
      new PutObjectCommand({
        Bucket: env.r2.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );
    return { key, storage: 'r2', originalName: file.originalname, size: file.size, mimeType: file.mimetype };
  }

  const target = path.join(LOCAL_DIR, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, file.buffer);
  return { key, storage: 'local', originalName: file.originalname, size: file.size, mimeType: file.mimetype };
}

/** Returns the file contents as a Buffer. Used by scanner providers. */
export async function readFile(key, storage = isR2Configured() ? 'r2' : 'local') {
  if (storage === 'r2') {
    const res = await r2().send(new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }));
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }
  return fs.readFile(path.join(LOCAL_DIR, key));
}

export async function deleteFile(key, storage = isR2Configured() ? 'r2' : 'local') {
  if (storage === 'r2') {
    await r2().send(new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }));
    return;
  }
  await fs.rm(path.join(LOCAL_DIR, key), { force: true });
}
