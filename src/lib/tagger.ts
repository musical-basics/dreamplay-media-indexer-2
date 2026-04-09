import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import {
  Subject, HandZone, DSModel, Purpose, Campaign, ShotType, AssetRecord
} from './taxonomy';

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'your_gemini_api_key_here') {
      throw new Error('GEMINI_API_KEY not set in .env.local');
    }
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

const SYSTEM_INSTRUCTION = `You are a media metadata expert for DreamPlay Pianos, a premium ergonomic piano brand.
Your job is to analyze photos and videos and return structured JSON tags.

DreamPlay context:
- DS5.5® = 7/8 size keyboard for small hands (Zone A, hand span < 7.6 inches)
- DS6.0® = Universal size (Zone B, hand span 7.6"–8.5")
- DS6.5™ = Conventional/standard size (Zone C, hand span > 8.5")
- Zone A = Petite hands, DS5.5
- Zone B = Average hands, DS6.0
- Zone C = Larger hands, DS6.5

Always return only valid JSON. No markdown, no explanation.`;

interface AITags {
  subject: Subject;
  handZone: HandZone;
  dsModel: DSModel;
  purpose: Purpose;
  shotType: ShotType;
  mood: string;
  colorGrade: string;
  aiDescription: string;
  aiKeywords: string[];
}

const DEFAULT_TAGS: AITags = {
  subject: 'unknown',
  handZone: null,
  dsModel: null,
  purpose: 'unknown',
  shotType: 'unknown',
  mood: '',
  colorGrade: '',
  aiDescription: '',
  aiKeywords: [],
};

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call a Gemini API function with exponential backoff retry on rate-limit (429) or 503 errors.
 * Retries up to maxRetries times with jittered exponential back-off.
 */
async function withBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = String(err);
      const isRetryable =
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('Too Many Requests') ||
        msg.includes('Service Unavailable');

      if (!isRetryable || attempt === maxRetries) break;

      const baseDelay = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
      const jitter = Math.random() * 1000;
      const delay = Math.min(baseDelay + jitter, 30_000); // cap at 30s
      console.warn(`[Gemini] ${label}: attempt ${attempt + 1} → rate limited. Retrying in ${Math.round(delay / 1000)}s…`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

export async function analyzeAssetWithGemini(
  filePath: string,
  mediaType: 'video' | 'image',
  thumbPath: string | null
): Promise<AITags> {
  const ai = getAI();

  // Use thumbnail for video analysis if available, else skip vision for videos
  const analysisPath = mediaType === 'video' ? thumbPath : filePath;
  if (!analysisPath || !fs.existsSync(analysisPath)) {
    return { ...DEFAULT_TAGS, aiDescription: `File: ${path.basename(filePath)}` };
  }

  const ext = path.extname(analysisPath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
  };
  const mimeType = mimeMap[ext] ?? 'image/jpeg';

  const imageData = fs.readFileSync(analysisPath);
  const base64 = imageData.toString('base64');

  const prompt = `Analyze this DreamPlay Pianos media asset and return JSON with these exact keys:
{
  "subject": one of: "hands"|"piano-keys"|"piano-full"|"talking-head"|"lifestyle"|"product"|"abstract"|"mixed"|"unknown",
  "handZone": one of: "Zone A"|"Zone B"|"Zone C"|null (only if hands are visible and zone is determinable),
  "dsModel": one of: "DS5.5"|"DS6.0"|"DS6.5"|null (only if keyboard size is determinable),
  "purpose": one of: "education"|"marketing"|"social-reel"|"product-demo"|"testimonial"|"b-roll"|"unknown",
  "shotType": one of: "close-up"|"medium"|"wide"|"overhead"|"POV"|"detail"|"unknown",
  "mood": "comma-separated mood descriptors, e.g. cinematic, intimate, warm",
  "colorGrade": "brief color grade description, e.g. teal-orange, desaturated, warm golden",
  "aiDescription": "one sentence describing what this clip shows for a video editor",
  "aiKeywords": ["array", "of", "searchable", "keywords"]
}

Return ONLY the JSON object, nothing else.`;

  const label = path.basename(filePath);

  try {
    const response = await withBackoff(() =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: base64, mimeType } },
              { text: prompt },
            ],
          },
        ],
        config: { systemInstruction: SYSTEM_INSTRUCTION },
      }),
      label,
    );

    const text = response.text?.trim() ?? '';
    // Strip markdown code blocks if Gemini wraps it
    const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      subject: parsed.subject ?? 'unknown',
      handZone: parsed.handZone ?? null,
      dsModel: parsed.dsModel ?? null,
      purpose: parsed.purpose ?? 'unknown',
      shotType: parsed.shotType ?? 'unknown',
      mood: parsed.mood ?? '',
      colorGrade: parsed.colorGrade ?? '',
      aiDescription: parsed.aiDescription ?? '',
      aiKeywords: Array.isArray(parsed.aiKeywords) ? parsed.aiKeywords : [],
    };
  } catch (err) {
    console.error(`[Gemini] Error analyzing ${label}:`, err);
    return { ...DEFAULT_TAGS, aiDescription: `File: ${label}` };
  }
}
