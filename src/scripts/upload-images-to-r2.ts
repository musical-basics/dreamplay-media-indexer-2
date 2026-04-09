#!/usr/bin/env tsx
/**
 * DreamPlay Media Indexer — Upload Images to Cloudflare R2
 * Usage: pnpm upload-images-r2
 *
 * 1. Fetches all image assets from Supabase where fileUrl IS NULL (not yet uploaded)
 * 2. Uploads each original image file to Cloudflare R2 at images/{filename}
 * 3. Updates asset_indexer.assets.fileUrl to the public R2 URL
 *
 * filePath (local path) is preserved unchanged for ingest deduplication.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ── Load .env.local ────────────────────────────────────────────────────────────
const dotenvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(dotenvPath)) {
  const lines = fs.readFileSync(dotenvPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET = process.env.R2_BUCKET_NAME ?? 'dreamplay-assets';
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL!;

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL })) {
  if (!v) { console.error(`❌  Missing env var: ${k}`); process.exit(1); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'asset_indexer' as any },
  auth: { persistSession: false },
});

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.tiff': 'image/tiff',
  '.heic': 'image/heic', '.heif': 'image/heif',
};

const CONCURRENCY = 4;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uploadAndUpdate(asset: any): Promise<'ok' | 'skip' | 'err'> {
  const localPath = asset.filePath as string;
  if (!fs.existsSync(localPath)) return 'skip';

  const ext = path.extname(localPath).toLowerCase();
  const filename = path.basename(localPath);
  const r2Key = `images/${filename}`;
  const contentType = MIME_MAP[ext] ?? 'application/octet-stream';

  try {
    const fileData = fs.readFileSync(localPath);
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: fileData,
      ContentType: contentType,
    }));

    const fileUrl = `${R2_PUBLIC_URL}/${r2Key}`;

    const { error } = await supabase
      .from('assets')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ fileUrl } as any)
      .eq('id', asset.id);

    if (error) { console.error(`\n  ⚠ DB update failed ${asset.id}:`, error.message); return 'err'; }
    return 'ok';
  } catch (e) {
    console.error(`\n  ⚠ Upload failed ${filename}:`, (e as Error).message);
    return 'err';
  }
}

async function main() {
  console.log('\n🖼  DreamPlay — Uploading Images to Cloudflare R2');
  console.log(`   Bucket: ${R2_BUCKET}`);
  console.log(`   Public URL: ${R2_PUBLIC_URL}\n`);

  // Fetch images not yet uploaded (fileUrl IS NULL)
  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, filePath, fileName')
    .eq('mediaType', 'image')
    .is('fileUrl', null);

  if (error) { throw new Error(`Failed to fetch: ${error.message}`); }
  console.log(`📦  Images to upload: ${assets?.length ?? 0}\n`);

  if (!assets?.length) {
    console.log('✅  All images already uploaded to R2.');
    return;
  }

  let done = 0, skipped = 0, errors = 0;

  for (let i = 0; i < assets.length; i += CONCURRENCY) {
    const batch = assets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(uploadAndUpdate));
    results.forEach(r => { if (r === 'ok') done++; else if (r === 'skip') skipped++; else errors++; });
    process.stdout.write(`\r   ↳ Uploaded ${done} / ${assets.length}  (skipped ${skipped}, errors ${errors})…`);
  }

  console.log(`\n\n✅  Done!`);
  console.log(`   Uploaded:  ${done}`);
  console.log(`   Skipped (file not found): ${skipped}`);
  console.log(`   Errors: ${errors}\n`);
}

main().catch(err => {
  console.error('\n❌  Failed:', err.message ?? err);
  process.exit(1);
});
