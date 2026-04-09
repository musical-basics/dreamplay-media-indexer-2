import { AssetRecord } from '../taxonomy';

// FCPXML 1.11 exporter for Final Cut Pro X
// Uses per-asset fps from ffprobe; falls back to 24 if null.
// Sequence format is built from the most common fps in the asset set.

function dominantFps(assets: AssetRecord[]): number {
  const counts = new Map<number, number>();
  for (const a of assets) {
    if (!a.fps) continue;
    const rounded = roundFps(a.fps);
    counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
  }
  if (counts.size === 0) return 24;
  let best = 24;
  let bestCount = 0;
  for (const [fps, count] of counts) {
    if (count > bestCount) { bestCount = count; best = fps; }
  }
  return best;
}

/** Round to the nearest standard framerate */
function roundFps(fps: number): number {
  const standards = [24, 25, 30, 48, 50, 60];
  return standards.reduce((prev, curr) =>
    Math.abs(curr - fps) < Math.abs(prev - fps) ? curr : prev
  );
}

/** Convert seconds to FCPXML rational time: frames/fpsS */
function toFCPTime(seconds: number, fps: number): string {
  const frames = Math.round(seconds * fps);
  return `${frames}/${fps}s`;
}

/** FCP format name for common frame rates */
function fcpFormatName(fps: number): string {
  const names: Record<number, string> = {
    24: 'FFVideoFormat1080p24',
    25: 'FFVideoFormat1080p25',
    30: 'FFVideoFormat1080p30',
    48: 'FFVideoFormat1080p48',
    50: 'FFVideoFormat1080p50',
    60: 'FFVideoFormat1080p60',
  };
  return names[fps] ?? `FFVideoFormat1080p${fps}`;
}

export function generateFCPXML(
  assets: AssetRecord[],
  eventName = 'DreamPlay Library',
  projectName = 'DreamPlay Timeline'
): string {
  const videoAssets = assets.filter(a => a.mediaType === 'video');
  const seqFps = dominantFps(videoAssets);
  const seqFrameDuration = `1/${seqFps}s`;

  // Collect unique fps values to register format resources
  const fpsSet = new Set<number>([seqFps]);
  for (const a of videoAssets) {
    if (a.fps) fpsSet.add(roundFps(a.fps));
  }

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<!DOCTYPE fcpxml>`);
  lines.push(`<fcpxml version="1.11">`);
  lines.push(`  <resources>`);

  // Register one format resource per unique fps (r1 = sequence fps)
  let formatIdx = 1;
  const formatIdMap = new Map<number, string>();
  for (const fps of fpsSet) {
    const fid = `r${formatIdx++}`;
    formatIdMap.set(fps, fid);
    lines.push(`    <format id="${fid}" name="${fcpFormatName(fps)}" frameDuration="1/${fps}s" width="1920" height="1080" colorSpace="1-1-1 (Rec. 709)"/>`);
  }

  const seqFormatId = formatIdMap.get(seqFps) ?? 'r1';

  // Register each asset as a resource
  for (const asset of videoAssets) {
    const clipFps = asset.fps ? roundFps(asset.fps) : seqFps;
    const clipFormatId = formatIdMap.get(clipFps) ?? seqFormatId;
    const duration = asset.durationSeconds ?? 3;
    const durationFCP = toFCPTime(duration, clipFps);
    lines.push(`    <asset id="${asset.id}" name="${escapeXml(asset.fileName)}" start="0s" duration="${durationFCP}" hasVideo="1" hasAudio="1" format="${clipFormatId}">`);
    lines.push(`      <media-rep kind="original-media" src="${encodeURI(`file://${asset.filePath}`)}"/>`);
    lines.push(`    </asset>`);
  }

  lines.push(`  </resources>`);
  lines.push(`  <library>`);
  lines.push(`    <event name="${escapeXml(eventName)}">`);
  lines.push(`      <project name="${escapeXml(projectName)}">`);
  lines.push(`        <sequence format="${seqFormatId}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k" frameDuration="${seqFrameDuration}">`);
  lines.push(`          <spine>`);

  let offset = 0; // in seconds (we convert per-clip to correct fps)
  for (const asset of videoAssets) {
    const clipFps = asset.fps ? roundFps(asset.fps) : seqFps;
    const duration = asset.durationSeconds ?? 3;
    // offset in sequence fps
    const offsetFCP = toFCPTime(offset, seqFps);
    // duration in clip fps (correct for the clip's native rate)
    const durationFCP = toFCPTime(duration, clipFps);
    lines.push(`            <clip name="${escapeXml(asset.fileName)}" ref="${asset.id}" offset="${offsetFCP}" duration="${durationFCP}" start="0s">`);
    lines.push(`              <note>${escapeXml(asset.aiDescription)}</note>`);
    lines.push(`            </clip>`);
    offset += duration;
  }

  lines.push(`          </spine>`);
  lines.push(`        </sequence>`);
  lines.push(`      </project>`);
  lines.push(`    </event>`);
  lines.push(`  </library>`);
  lines.push(`</fcpxml>`);

  return lines.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
