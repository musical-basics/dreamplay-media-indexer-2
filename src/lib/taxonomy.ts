// DreamPlay Media Indexer — Taxonomy Schema
// Matches the brand's DS Standard and Zone system

export type Subject =
  | 'hands'
  | 'piano-keys'
  | 'piano-full'
  | 'talking-head'
  | 'lifestyle'
  | 'product'
  | 'abstract'
  | 'mixed'
  | 'unknown';

export type HandZone = 'Zone A' | 'Zone B' | 'Zone C' | null;
export type DSModel = 'DS5.5' | 'DS6.0' | 'DS6.5' | null;

export type Purpose =
  | 'education'
  | 'marketing'
  | 'social-reel'
  | 'product-demo'
  | 'testimonial'
  | 'b-roll'
  | 'unknown';

export type Campaign =
  | 'CEO Spotlight'
  | 'Piano Comparison'
  | 'Handspan Measurement'
  | 'La Campanella'
  | 'NAMM'
  | 'Duel Piano'
  | 'Other';

export type ShotType =
  | 'close-up'
  | 'medium'
  | 'wide'
  | 'overhead'
  | 'POV'
  | 'detail'
  | 'unknown';

export type Orientation = 'landscape' | 'portrait' | 'square';
export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5' | 'other';
export type FinalStatus = 'final' | 'raw' | 'intermediate';
export type ColorLabel =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'gray'
  | null;
export type Priority = 'high' | 'normal';
export type MediaType = 'video' | 'image';

export interface AssetRecord {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  mediaType: MediaType;

  // Video/image technical info
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  fps: number | null;
  codec: string | null;
  orientation: Orientation | null;
  aspectRatio: AspectRatio | null;

  // DreamPlay taxonomy (AI-generated)
  subject: Subject;
  handZone: HandZone;
  dsModel: DSModel;
  purpose: Purpose;
  campaign: Campaign;
  shotType: ShotType;
  finalStatus: FinalStatus;
  colorLabel: ColorLabel;
  priority: Priority;
  mood: string;
  colorGrade: string;
  aiDescription: string;
  aiKeywords: string; // JSON-serialized string[]

  // Derived
  thumbPath: string | null;
  ingestedAt: number;
  updatedAt: number;
}

// Campaign detection from parent folder name
export function detectCampaignFromPath(filePath: string): Campaign {
  const lower = filePath.toLowerCase();
  if (lower.includes('ceo spotlight')) return 'CEO Spotlight';
  if (lower.includes('piano comparison') || lower.includes('keyboard comparison')) return 'Piano Comparison';
  if (lower.includes('handspan') || lower.includes('hand span') || lower.includes('ruler')) return 'Handspan Measurement';
  if (lower.includes('la campanella') || lower.includes('campanella')) return 'La Campanella';
  if (lower.includes('namm')) return 'NAMM';
  if (lower.includes('duel piano')) return 'Duel Piano';
  return 'Other';
}

// Detect if a file is final/raw/intermediate based on path
export function detectFinalStatus(filePath: string, codec: string | null, durationSeconds: number | null): FinalStatus {
  const lower = filePath.toLowerCase();
  const finalIndicators = [
    'resolve renders',
    'exported renders',
    'colorgraded exports',
    '/exported/',
    'final cut export',
    'youtube',
    '/ig (',
    'for editor',
    '/renders/',
  ];
  const isFinalPath = finalIndicators.some((indicator) => lower.includes(indicator));
  const isShortClip = durationSeconds !== null && durationSeconds <= 3.5;
  const isProRes = codec?.toLowerCase().includes('prores') ?? false;

  // .m4v is always a final export
  if (filePath.endsWith('.m4v')) return 'final';

  // ProRes is always raw
  if (isProRes) return 'raw';

  if (isFinalPath && isShortClip) return 'final';
  if (isFinalPath) return 'final';
  if (isShortClip) return 'intermediate'; // short but not in a final folder

  return 'raw';
}

// macOS Finder color label number → name
export const COLOR_LABEL_MAP: Record<number, ColorLabel> = {
  0: null,
  1: null, // None
  2: 'red',
  3: 'orange',
  4: 'yellow',
  5: 'green',
  6: 'blue',
  7: 'purple',
  8: 'gray',
};

// Supported file extensions
export const SUPPORTED_VIDEO_EXTS = new Set(['.mov', '.mp4', '.m4v', '.mxf', '.avi', '.mkv']);
export const SUPPORTED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tiff', '.tif']);
export const SKIP_EXTS = new Set(['.ds_store', '.drp', '.drx', '.psd', '.key', '.aep', '.prproj', '.fcpbundle', '.dpx', '.lut', '.cube']);
