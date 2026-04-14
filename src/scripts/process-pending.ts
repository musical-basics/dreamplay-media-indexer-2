#!/usr/bin/env tsx
/**
 * DreamPlay Assets — Background Processor
 * Runs on a VPS. Polls Supabase for browser-uploaded assets that need
 * processing (aiDescription = '').
 *
 * Usage:
 * pnpm process-pending        → one-shot: process all pending, then exit
 * pnpm process-watch          → continuous: poll every 60s
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { probeMedia, generateThumbnail } from '../lib/media-utils';
import { analyzeAssetWithGemini } from '../lib/tagger';
import { detectFinalStatus } from '../lib/taxonomy';

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

const THUMBS_DIR = process.env.THUMBS_DIR ?? path.join(process.cwd(), '.indexer-cache', 'thumbs');
const TEMP_DIR = path.join(process.cwd(), '.indexer-cache', 'remote-temp');
const POLL_INTERVAL_MS = 60_000;
const watchMode = process.argv.includes('--watch');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { db: { schema: 'asset_indexer' as any }, auth: { persistSession: false } },
);

function calcOrientation(w: number | null, h: number | null): string | null {
  if (!w || !h) return null;
  if (w > h) return 'landscape';
  if (h > w) return 'portrait';
  return 'square';
}

function calcAspectRatio(w: number | null, h: number | null): string | null {
  if (!w || !h) return null;
  const ratio = w / h;
  if (Math.abs(ratio - 9 / 16) < 0.05) return '9:16';
  if (Math.abs(ratio - 16 / 9) < 0.1) return '16:9';
  if (Math.abs(ratio - 1) < 0.05) return '1:1';
  if (Math.abs(ratio - 4 / 5) < 0.05) return '4:5';
  return 'other';
}

async function uploadThumbnailToStorage(localThumbPath: string, assetId: string): Promise<string> {
  const ext = path.extname(localThumbPath) || '.jpg';
  const filename = `${assetId}${ext}`;
  const fileData = fs.readFileSync(localThumbPath);

  const { error } = await supabase.storage
    .from('thumbnails')
    .upload(filename, fileData, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) throw new Error(`Thumbnail upload failed: ${error.message}`);

  const { data } = supabase.storage.from('thumbnails').getPublicUrl(filename);
  return data.publicUrl;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processAsset(asset: any): Promise<boolean> {
  const fileUrl = asset.fileUrl as string;
  const fileName = path.basename(asset.fileName as string);
  const mediaType = asset.mediaType as 'video' | 'image';
  const tempPath = path.join(TEMP_DIR, `${asset.id}_${fileName}`);
  const tmpDownload = `${tempPath}.downloading`;

  try {
    console.log(` ↓ Downloading: ${fileName}`);
    const r2Res = await fetch(fileUrl);
    if (!r2Res.ok || !r2Res.body) {
      console.error(` ✗ Failed to fetch ${fileName} from R2 (${r2Res.status})`);
      return false;
    }

    const fileStream = fs.createWriteStream(tmpDownload);
    await pipeline(Readable.fromWeb(r2Res.body as never), fileStream);
    fs.renameSync(tmpDownload, tempPath);

    const mediaInfo = mediaType === 'video'
      ? probeMedia(tempPath)
      : { width: null, height: null, durationSeconds: null, fps: null, codec: null };

    const localThumbPath = generateThumbnail(tempPath, THUMBS_DIR, asset.id);

    let thumbUrl: string | null = null;
    if (localThumbPath) {
      thumbUrl = await uploadThumbnailToStorage(localThumbPath, asset.id);
    } else if (mediaType === 'image') {
      thumbUrl = fileUrl;
    }

    const tags = await analyzeAssetWithGemini(tempPath, mediaType, localThumbPath);

    const { error: updateErr } = await supabase
      .from('assets')
      .update({
        width: mediaInfo.width,
        height: mediaInfo.height,
        durationSeconds: mediaInfo.durationSeconds,
        fps: mediaInfo.fps,
        codec: mediaInfo.codec,
        orientation: calcOrientation(mediaInfo.width, mediaInfo.height),
        aspectRatio: calcAspectRatio(mediaInfo.width, mediaInfo.height),
        subject: tags.subject,
        handZone: tags.handZone,
        dsModel: tags.dsModel,
        purpose: tags.purpose,
        shotType: tags.shotType,
        mood: tags.mood,
        colorGrade: tags.colorGrade,
        aiDescription: tags.aiDescription,
        aiKeywords: JSON.stringify(tags.aiKeywords),
        thumbPath: thumbUrl,
        finalStatus: detectFinalStatus(tempPath, mediaInfo.codec, mediaInfo.durationSeconds),
        updatedAt: Date.now(),
      })
      .eq('id', asset.id);

    if (updateErr) {
      console.error(` ✗ DB update failed for ${fileName}: ${updateErr.message}`);
      return false;
    }

    console.log(` ✓ ${fileName} — ${tags.aiDescription.slice(0, 80)}`);
    return true;
  } catch (err) {
    console.error(` ✗ Error processing ${fileName}:`, err);
    return false;
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    if (fs.existsSync(tmpDownload)) fs.unlinkSync(tmpDownload);
  }
}

async function processPendingBatch(): Promise<number> {
  const { data: pending, error } = await supabase
    .from('assets')
    .select('id, fileName, fileUrl, mediaType')
    .not('fileUrl', 'is', null)
    .eq('aiDescription', '')
    .limit(20);

  if (error) {
    console.error('[process-pending] Query error:', error.message);
    return 0;
  }
  if (!pending?.length) return 0;

  console.log(`\n[process-pending] Found ${pending.length} assets to process`);
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  fs.mkdirSync(THUMBS_DIR, { recursive: true });

  let processed = 0;
  for (const asset of pending) {
    const ok = await processAsset(asset);
    if (ok) processed++;
  }

  return processed;
}

async function main() {
  console.log('\n🎹 DreamPlay Assets — Background Processor (VPS)');
  console.log(` Mode: ${watchMode ? `watch (poll every ${POLL_INTERVAL_MS / 1000}s)` : 'one-shot'}`);
  console.log('');

  const count = await processPendingBatch();
  console.log(`\n[process-pending] ✓ Processed ${count} assets.`);

  if (watchMode) {
    setInterval(async () => {
      const n = await processPendingBatch();
      if (n > 0) console.log(`[process-pending] ✓ Processed ${n} assets.`);
    }, POLL_INTERVAL_MS);
    console.log('[process-pending] Watching for new uploads…\n');
    return;
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[process-pending] Fatal error:', err);
  process.exit(1);
});
