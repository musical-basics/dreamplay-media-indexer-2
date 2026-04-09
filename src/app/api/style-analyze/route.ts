import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { StyleProfile } from '../style-library/route';

const DATA_DIR = path.join(process.cwd(), 'data', 'styles');
function profilePath(id: string) { return path.join(DATA_DIR, `${id}.json`); }

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

const ANALYSIS_PROMPT = `You are a video strategist and creative director. Analyze this video and extract its "Style DNA" for use as a reference guide when creating similar content.

Extract and return ONLY this JSON:
{
  "hookStyle": "How the video opens and grabs attention in the first 3 seconds",
  "pacing": "Cut rhythm and speed (e.g. 'Very fast 0.5-1s cuts', 'Slow cinematic 3-5s shots')",
  "shotTypes": ["list", "of", "shot", "types", "used"],
  "textOverlayStyle": "How text appears on screen (size, style, placement, timing)",
  "toneEnergy": "Overall emotional tone and energy level",
  "ctaStyle": "How the video ends and prompts action",
  "musicStyle": "Music style, BPM feel, energy",
  "keyInsights": ["3-5 key creative techniques used"],
  "recommendedFor": "Best use cases for this style"
}`;

// POST /api/style-analyze
// { id: string, url?: string, filePath?: string }
// Analyzes a video via Gemini and updates the style profile
export async function POST(req: NextRequest) {
  let id = '';
  try {
    const body = await req.json();
    id = body.id;
    const url: string | undefined = body.url;
    const filePath: string | undefined = body.filePath;

    const p = profilePath(id);
    if (!fs.existsSync(p)) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile: StyleProfile = JSON.parse(fs.readFileSync(p, 'utf-8'));

    const ai = getAI();
    let analysisParts: object[];

    if (url) {
      // YouTube or direct URL — pass as fileData
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      if (isYouTube) {
        analysisParts = [
          { text: ANALYSIS_PROMPT },
          { fileData: { fileUri: url, mimeType: 'video/mp4' } },
        ];
      } else {
        // Direct video URL — try as fileData with detected mime type
        const mimeType = url.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
        analysisParts = [
          { text: ANALYSIS_PROMPT },
          { fileData: { fileUri: url, mimeType } },
        ];
      }
    } else if (filePath) {
      // Local file — upload to Gemini Files API then analyze
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = ext === '.mov' ? 'video/quicktime' : ext === '.webm' ? 'video/webm' : 'video/mp4';

      // Upload file to Gemini Files API
      const fileBuffer = fs.readFileSync(filePath);
      const blob = new Blob([fileBuffer], { type: mimeType });
      const uploadResult = await ai.files.upload({ file: blob, config: { mimeType, displayName: path.basename(filePath) } });

      // Wait for file to be processed
      let fileState = uploadResult;
      let attempts = 0;
      while (fileState.state === 'PROCESSING' && attempts < 30) {
        await new Promise(r => setTimeout(r, 3000));
        fileState = await ai.files.get({ name: uploadResult.name ?? '' });
        attempts++;
      }

      if (fileState.state !== 'ACTIVE') {
        throw new Error(`File processing failed: ${fileState.state}`);
      }

      analysisParts = [
        { text: ANALYSIS_PROMPT },
        { fileData: { fileUri: fileState.uri, mimeType } },
      ];
    } else {
      return NextResponse.json({ error: 'Provide url or filePath' }, { status: 400 });
    }

    // Run analysis
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: analysisParts }],
      config: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    });

    const raw = response.text?.trim() ?? '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const text = start !== -1 && end > start ? raw.slice(start, end + 1) : raw;
    const analysis = JSON.parse(text);

    // Build a style summary paragraph for prompt injection
    const styleSummary = `REFERENCE STYLE GUIDE — "${profile.name}":
Hook: ${analysis.hookStyle}
Pacing: ${analysis.pacing}
Shot types: ${Array.isArray(analysis.shotTypes) ? analysis.shotTypes.join(', ') : analysis.shotTypes}
Text overlays: ${analysis.textOverlayStyle}
Tone/Energy: ${analysis.toneEnergy}
CTA: ${analysis.ctaStyle}
Music: ${analysis.musicStyle}
Key techniques: ${Array.isArray(analysis.keyInsights) ? analysis.keyInsights.join('; ') : analysis.keyInsights}

Emulate this style closely when selecting clips, writing script lines, and planning transitions.`;

    // Update profile
    const updated: StyleProfile = { ...profile, status: 'ready', analysis, styleSummary };
    fs.writeFileSync(p, JSON.stringify(updated, null, 2));

    return NextResponse.json({ profile: updated });
  } catch (err) {
    console.error('[style-analyze]', err);
    // Update profile with error status
    if (id) {
      const p = profilePath(id);
      if (fs.existsSync(p)) {
        const profile: StyleProfile = JSON.parse(fs.readFileSync(p, 'utf-8'));
        fs.writeFileSync(p, JSON.stringify({ ...profile, status: 'error', errorMsg: String(err) }, null, 2));
      }
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
