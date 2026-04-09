import { execSync, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface MediaInfo {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  fps: number | null;
  codec: string | null;
}

export function probeMedia(filePath: string): MediaInfo {
  try {
    const result = spawnSync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath,
    ], { encoding: 'utf8', timeout: 15000 });

    if (result.status !== 0) return emptyInfo();
    const data = JSON.parse(result.stdout);
    const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
    const format = data.format;

    if (!videoStream && !format) return emptyInfo();

    const durationSeconds = parseFloat(format?.duration ?? videoStream?.duration ?? '0') || null;
    const fps = videoStream?.r_frame_rate
      ? evalFraction(videoStream.r_frame_rate)
      : null;

    return {
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      durationSeconds: durationSeconds && durationSeconds > 0 ? durationSeconds : null,
      fps: fps && fps > 0 ? fps : null,
      codec: videoStream?.codec_name ?? null,
    };
  } catch {
    return emptyInfo();
  }
}

function evalFraction(frac: string): number | null {
  const [num, den] = frac.split('/').map(Number);
  if (!den || den === 0) return num || null;
  return num / den;
}

function emptyInfo(): MediaInfo {
  return { width: null, height: null, durationSeconds: null, fps: null, codec: null };
}

export function generateThumbnail(filePath: string, thumbsDir: string, assetId: string): string | null {
  if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir, { recursive: true });
  }

  const thumbPath = path.join(thumbsDir, `${assetId}.jpg`);
  if (fs.existsSync(thumbPath)) return thumbPath;

  try {
    const ext = path.extname(filePath).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(ext)) {
      // For images, just copy/resize via sips (native macOS)
      spawnSync('sips', ['--resampleWidth', '400', '-s', 'format', 'jpeg', filePath, '--out', thumbPath], {
        timeout: 10000
      });
    } else {
      // For videos, extract frame at 0.5s
      spawnSync('ffmpeg', [
        '-y', '-ss', '0.5',
        '-i', filePath,
        '-vframes', '1',
        '-vf', 'scale=400:-1',
        '-q:v', '3',
        thumbPath,
      ], { timeout: 15000 });
    }
    return fs.existsSync(thumbPath) ? thumbPath : null;
  } catch {
    return null;
  }
}

export function readMacColorLabel(filePath: string): number {
  try {
    const result = spawnSync('mdls', ['-raw', '-name', 'kMDItemFSLabel', filePath], {
      encoding: 'utf8', timeout: 5000
    });
    const val = parseInt(result.stdout.trim(), 10);
    return isNaN(val) ? 0 : val;
  } catch {
    return 0;
  }
}
