import { AssetRecord } from '../taxonomy';

// DaVinci Resolve-compatible XML export (XMEML v4)
// Uses per-asset fps from ffprobe; falls back to 24 if null.
// Sequence base rate is the most common fps found in the asset set.

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

export function generateDaVinciXML(assets: AssetRecord[], timelineName = 'DreamPlay Timeline'): string {
  const seqFps = dominantFps(assets);
  const videoAssets = assets.filter(a => a.mediaType === 'video');
  const lines: string[] = [];

  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<!DOCTYPE xmeml PUBLIC "-//Apple Computer//DTD FC XML 1.0//EN" "http://www.apple.com/DTDs/FCF.dtd">`);
  lines.push(`<xmeml version="4">`);
  lines.push(`  <sequence>`);
  lines.push(`    <name>${escapeXml(timelineName)}</name>`);
  lines.push(`    <rate><timebase>${seqFps}</timebase><ntsc>FALSE</ntsc></rate>`);
  lines.push(`    <media>`);
  lines.push(`      <video>`);
  lines.push(`        <format>`);
  lines.push(`          <samplecharacteristics>`);
  lines.push(`            <width>1920</width>`);
  lines.push(`            <height>1080</height>`);
  lines.push(`            <rate><timebase>${seqFps}</timebase><ntsc>FALSE</ntsc></rate>`);
  lines.push(`          </samplecharacteristics>`);
  lines.push(`        </format>`);
  lines.push(`        <track>`);

  let timelineStart = 0; // in seqFps frames

  for (const asset of videoAssets) {
    // Use asset's actual fps; round to standard; fall back to seqFps
    const clipFps = asset.fps ? roundFps(asset.fps) : seqFps;
    const duration = asset.durationSeconds ?? 3;

    // Duration in clip's own fps frames (for in/out points)
    const durationClipFrames = Math.round(duration * clipFps);
    // Duration in sequence fps frames (for timeline start/end)
    const durationSeqFrames = Math.round(duration * seqFps);
    const clipEnd = timelineStart + durationSeqFrames;

    lines.push(`          <clipitem>`);
    lines.push(`            <name>${escapeXml(asset.fileName)}</name>`);
    lines.push(`            <duration>${durationSeqFrames}</duration>`);
    lines.push(`            <rate><timebase>${clipFps}</timebase><ntsc>FALSE</ntsc></rate>`);
    lines.push(`            <start>${timelineStart}</start>`);
    lines.push(`            <end>${clipEnd}</end>`);
    lines.push(`            <in>0</in>`);
    lines.push(`            <out>${durationClipFrames}</out>`);
    lines.push(`            <file id="${asset.id}">`);
    lines.push(`              <name>${escapeXml(asset.fileName)}</name>`);
    lines.push(`              <pathurl>${encodeURI(`file://${asset.filePath}`)}</pathurl>`);
    lines.push(`              <duration>${durationClipFrames}</duration>`);
    lines.push(`              <rate><timebase>${clipFps}</timebase><ntsc>FALSE</ntsc></rate>`);
    if (asset.width && asset.height) {
      lines.push(`              <media><video><samplecharacteristics>`);
      lines.push(`                <width>${asset.width}</width>`);
      lines.push(`                <height>${asset.height}</height>`);
      lines.push(`              </samplecharacteristics></video></media>`);
    }
    lines.push(`            </file>`);
    lines.push(`          </clipitem>`);

    timelineStart = clipEnd;
  }

  lines.push(`        </track>`);
  lines.push(`      </video>`);
  lines.push(`    </media>`);
  lines.push(`  </sequence>`);
  lines.push(`</xmeml>`);

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
