#!/usr/bin/env tsx
/**
 * DreamPlay Media Indexer — Upload Thumbnails to Supabase Storage
 * Usage: pnpm upload-thumbs
 *
 * 1. Creates a public "thumbnails" bucket in Supabase Storage (if needed)
 * 2. Uploads each local thumbnail JPG to the bucket
 * 3. Updates asset_indexer.assets.thumbPath to the public Supabase URL
 */

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
const THUMBS_DIR = process.env.THUMBS_DIR ??
  '/Users/lionelyu/Documents/DreamPlay Assets/Anti-Gravity Projects/DreamPlay-Media/dreamplay-media-indexer-1/.indexer-cache/thumbs';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'asset_indexer' as any },
  auth: { persistSession: false },
});

const BUCKET = 'thumbnails';
const CONCURRENCY = 5;

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error) throw new Error(`Failed to create bucket: ${error.message}`);
    console.log('✓ Created public storage bucket:', BUCKET);
  } else {
    console.log('✓ Bucket exists:', BUCKET);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uploadAndUpdate(asset: any): Promise<boolean> {
  const localPath = (() => {
    // The stored thumbPath may use old path — extract the UUID filename and find locally
    const basename = path.basename(asset.thumbPath ?? '');
    if (!basename || !basename.endsWith('.jpg')) return null;
    return path.join(THUMBS_DIR, basename);
  })();

  if (!localPath || !fs.existsSync(localPath)) return false;

  const filename = path.basename(localPath);
  const fileData = fs.readFileSync(localPath);

  // Upload to Supabase Storage
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(filename, fileData, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadErr) {
    console.error(`  ⚠ Upload failed for ${filename}:`, uploadErr.message);
    return false;
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  // Update thumbPath in Supabase
  const { error: updateErr } = await supabase
    .from('assets')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ thumbPath: publicUrl } as any)
    .eq('id', asset.id);

  if (updateErr) {
    console.error(`  ⚠ DB update failed for ${asset.id}:`, updateErr.message);
    return false;
  }

  return true;
}

async function main() {
  console.log('\n🖼  DreamPlay — Uploading Thumbnails to Supabase Storage');
  console.log(`   Local thumbs: ${THUMBS_DIR}`);
  console.log(`   Supabase URL: ${SUPABASE_URL}\n`);

  await ensureBucket();

  // Fetch all assets that have a local thumbPath (not already a URL)
  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, thumbPath')
    .not('thumbPath', 'is', null)
    .not('thumbPath', 'like', 'http%');

  if (error) throw new Error(`Failed to fetch assets: ${error.message}`);
  console.log(`📦  Assets with local thumbPath: ${assets?.length ?? 0}\n`);

  if (!assets?.length) {
    console.log('✅  Nothing to upload — all thumbPaths are already Supabase URLs.');
    return;
  }

  let done = 0, skipped = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < assets.length; i += CONCURRENCY) {
    const batch = assets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(uploadAndUpdate));
    results.forEach(ok => ok ? done++ : skipped++);
    process.stdout.write(`\r   ↳ Uploaded ${done} / ${assets.length}  (skipped ${skipped})…`);
  }

  console.log(`\n\n✅  Done!`);
  console.log(`   Uploaded: ${done}`);
  console.log(`   Skipped (file not found): ${skipped}\n`);
}

main().catch(err => {
  console.error('\n❌  Failed:', err.message ?? err);
  process.exit(1);
});
