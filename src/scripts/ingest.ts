#!/usr/bin/env tsx
/**
 * DreamPlay Media Indexer — Ingestion Agent
 * Usage:
 *   pnpm ingest           → one-shot full scan
 *   pnpm ingest --watch   → continuous watch mode
 *   pnpm ingest --final   → only index final/rendered clips
 *   pnpm ingest --limit=N → only index first N files (testing)
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import chokidar from 'chokidar';
import {
  SUPPORTED_VIDEO_EXTS,
  SUPPORTED_IMAGE_EXTS,
  SKIP_EXTS,
  detectCampaignFromPath,
  detectFinalStatus,
  COLOR_LABEL_MAP,
  AssetRecord,
  Orientation,
  AspectRatio,
} from '../lib/taxonomy';
import { upsertAsset, getAssetByPath } from '../lib/db';
import { probeMedia, generateThumbnail, readMacColorLabel } from '../lib/media-utils';
import { analyzeAssetWithGemini } from '../lib/tagger';

// Maximum number of files to AI-tag concurrently.
// Keeps Gemini API well under rate limits (15 RPM on free tier).
const INGEST_CONCURRENCY = 4;

// Load .env.local manually
const dotenvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(dotenvPath)) {
  const lines = fs.readFileSync(dotenvPath, 'utf8').split('\n');
  for (const line of lines) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  }
}

const ASSETS_ROOT = process.env.ASSETS_ROOT ?? '/Users/lionelyu/Documents/DreamPlay Assets';
const THUMBS_DIR = process.env.THUMBS_DIR ?? path.join(process.cwd(), '.indexer-cache', 'thumbs');
const watchMode = process.argv.includes('--watch');
const finalOnly = process.argv.includes('--final');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

// Directories to skip entirely
const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.next', '.indexer-cache',
  'Anti-Gravity Projects', // skip the app itself
]);

function shouldSkipDir(dirName: string): boolean {
  return SKIP_DIRS.has(dirName);
}

function isSupported(filePath: string): 'video' | 'image' | null {
  const ext = path.extname(filePath).toLowerCase();
  if (SKIP_EXTS.has(ext)) return null;
  if (SUPPORTED_VIDEO_EXTS.has(ext)) return 'video';
  if (SUPPORTED_IMAGE_EXTS.has(ext)) return 'image';
  return null;
}

function calcOrientation(w: number | null, h: number | null): Orientation | null {
  if (!w || !h) return null;
  if (w > h) return 'landscape';
  if (h > w) return 'portrait';
  return 'square';
}

function calcAspectRatio(w: number | null, h: number | null): AspectRatio | null {
  if (!w || !h) return null;
  const ratio = w / h;
  if (Math.abs(ratio - 9 / 16) < 0.05) return '9:16';
  if (Math.abs(ratio - 16 / 9) < 0.1) return '16:9';
  if (Math.abs(ratio - 1) < 0.05) return '1:1';
  if (Math.abs(ratio - 4 / 5) < 0.05) return '4:5';
  return 'other';
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.mov': 'video/quicktime',
    '.mp4': 'video/mp4',
    '.m4v': 'video/x-m4v',
    '.mxf': 'application/mxf',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
  };
  return map[ext] ?? 'application/octet-stream';
}

async function ingestFile(filePath: string, processed: { count: number }): Promise<void> {
  if (processed.count >= limit) return;

  const mediaType = isSupported(filePath);
  if (!mediaType) return;

  // Check if already ingested and unchanged
  const existing = await getAssetByPath(filePath);
  const stat = fs.statSync(filePath);
  if (existing && existing.fileSize === stat.size && existing.updatedAt > stat.mtimeMs) {
    return; // skip — unchanged
  }

  console.log(`[ingest] Processing: ${path.relative(ASSETS_ROOT, filePath)}`);
  processed.count++;

  // 1. Probe media info
  const mediaInfo = mediaType === 'video' ? probeMedia(filePath) : { width: null, height: null, durationSeconds: null, fps: null, codec: null };

  // 2. For images, get dimensions via sips
  let width = mediaInfo.width;
  let height = mediaInfo.height;

  // 3. Detect status
  const status = detectFinalStatus(filePath, mediaInfo.codec, mediaInfo.durationSeconds);
  if (finalOnly && status !== 'final') return;

  // 4. Read macOS color label
  const labelNum = readMacColorLabel(filePath);
  const colorLabel = COLOR_LABEL_MAP[labelNum] ?? null;
  const priority = (colorLabel === 'red' || colorLabel === 'purple') ? 'high' : 'normal';

  // 5. Generate thumbnail
  const assetId = existing?.id ?? uuidv4();
  const thumbPath = generateThumbnail(filePath, THUMBS_DIR, assetId);

  // 6. AI tagging
  const tags = await analyzeAssetWithGemini(filePath, mediaType, thumbPath);

  // 7. Build record
  const record: AssetRecord = {
    id: assetId,
    filePath,
    fileName: path.basename(filePath),
    fileSize: stat.size,
    mimeType: getMimeType(filePath),
    mediaType,
    width,
    height,
    durationSeconds: mediaInfo.durationSeconds,
    fps: mediaInfo.fps,
    codec: mediaInfo.codec,
    orientation: calcOrientation(width, height),
    aspectRatio: calcAspectRatio(width, height),
    subject: tags.subject,
    handZone: tags.handZone,
    dsModel: tags.dsModel,
    purpose: tags.purpose,
    campaign: detectCampaignFromPath(filePath),
    shotType: tags.shotType,
    finalStatus: status,
    colorLabel,
    priority,
    mood: tags.mood,
    colorGrade: tags.colorGrade,
    aiDescription: tags.aiDescription,
    aiKeywords: JSON.stringify(tags.aiKeywords),
    thumbPath,
    ingestedAt: existing?.ingestedAt ?? Date.now(),
    updatedAt: Date.now(),
  };

  await upsertAsset(record);
  console.log(`   ✓ [${status}] [${priority}] ${tags.subject} — ${tags.aiDescription.slice(0, 80)}`);
}

/**
 * Run an async task for each item with a max concurrency limit.
 * Like Promise.all but respects the concurrency cap.
 */
async function concurrentMap<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}

async function walkAndIngest(dir: string, processed: { count: number }): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  // Separate directories and files
  const subDirs: string[] = [];
  const files: string[] = [];
  for (const entry of entries) {
    if (processed.count >= limit) break;
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) subDirs.push(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      files.push(path.join(dir, entry.name));
    }
  }

  // Process files in this directory with concurrency control
  await concurrentMap(
    files,
    (filePath) => ingestFile(filePath, processed),
    INGEST_CONCURRENCY,
  );

  // Recurse into subdirectories sequentially to avoid overwhelming disk + API
  for (const subDir of subDirs) {
    if (processed.count >= limit) break;
    await walkAndIngest(subDir, processed);
  }
}

const SCAN_INTERVAL_MS = (() => {
  const arg = process.argv.find((a) => a.startsWith('--interval='));
  return arg ? parseInt(arg.split('=')[1], 10) * 1000 : 5 * 60 * 1000; // default 5 min
})();

// Write scan status file so the API can read it
function writeScanStatus(status: 'idle' | 'scanning', lastScan?: number) {
  const statusPath = path.join(process.cwd(), '.indexer-cache', 'scan-status.json');
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify({ status, lastScan: lastScan ?? Date.now() }), 'utf8');
}

async function runFullScan() {
  writeScanStatus('scanning');
  const processed = { count: 0 };
  await walkAndIngest(ASSETS_ROOT, processed);
  writeScanStatus('idle', Date.now());
  console.log(`[scan] ✓ Scan complete — ${processed.count} files processed.`);
}

async function main() {
  console.log(`\n🎹 DreamPlay Media Indexer — Ingestion Agent`);
  console.log(`   Assets root: ${ASSETS_ROOT}`);
  console.log(`   Thumbs dir:  ${THUMBS_DIR}`);
  console.log(`   Mode: ${watchMode ? `watch (rescan every ${SCAN_INTERVAL_MS / 1000}s)` : 'one-shot'}${finalOnly ? ' [final only]' : ''}`);
  console.log('');

  if (watchMode) {
    // chokidar for instant event-based triggers
    console.log('[watch] Starting file watcher + periodic re-scan...');
    const watcher = chokidar.watch(ASSETS_ROOT, {
      ignored: [
        /(^|[/\\])\../,
        /Anti-Gravity Projects/,
        /node_modules/,
        /\.indexer-cache/,
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
    });

    const processed = { count: 0 };
    watcher.on('add', (filePath) => ingestFile(filePath, processed));
    watcher.on('change', (filePath) => ingestFile(filePath, processed));

    // Initial scan on startup
    await runFullScan();

    // Periodic full re-scan every SCAN_INTERVAL_MS
    setInterval(async () => {
      console.log(`[watch] ⏱ Running periodic re-scan (every ${SCAN_INTERVAL_MS / 60000} min)...`);
      await runFullScan();
    }, SCAN_INTERVAL_MS);

    console.log(`[watch] Ready. Monitoring ${ASSETS_ROOT}`);
  } else {
    await runFullScan();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[ingest] Fatal error:', err);
  process.exit(1);
});
