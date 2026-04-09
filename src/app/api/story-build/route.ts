import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { queryAssets } from '@/lib/db';
import { AssetRecord } from '@/lib/taxonomy';
import { DREAMPLAY_BRAND_RULES } from '@/lib/brand-config';
import fs from 'fs';
import path from 'path';

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

export interface StoryboardClip {
  assetId: string;
  order: number;
  role: 'hook' | 'proof' | 'demo' | 'emotion' | 'cta';
  suggestedStartSec: number;
  suggestedEndSec: number;
  scriptLine: string;
  overlayText: string;
  overlayPlacement: 'top' | 'center' | 'bottom';
  overlayStyle: 'headline' | 'caption' | 'stat' | 'none';
  transitionNote: string;
}

export interface TextOverlay {
  clipOrder: number;
  text: string;
  placement: string;
  style: string;
  timing: string;
}

export interface MusicSuggestion {
  mood: string;
  bpm: number;
  bpmRange: string;
  energy: 'low' | 'medium' | 'high';
  genres: string[];
  trendingSongs: { title: string; artist: string; why: string }[];
  productionNotes: string;
}

export interface StoryBuildResponse {
  storyboard: StoryboardClip[];
  fullScript: string;
  voiceoverLines: string[];
  hookLine: string;
  callToAction: string;
  textOverlayPlan: TextOverlay[];
  musicSuggestion: MusicSuggestion;
  selectedAssetIds: string[];
  totalEstimatedDuration: number;
  directorNotes: string;
}

export interface StoryBuildRequest {
  intent: string;
  format: 'instagram-reel' | 'tiktok' | 'youtube-short' | 'facebook-ad' | 'custom';
  targetDurationSec: number;
  dsModel?: string;
  campaign?: string;
  subjects?: string[];
  shotTypes?: string[];
  moods?: string[];
  customNotes?: string;
  styleProfileId?: string; // reference style to emulate
  aiModel?: string;        // gemini model to use for generation
}

const FORMAT_CONTEXT: Record<string, string> = {
  'instagram-reel': 'Instagram Reel (9:16 vertical, max 90s, hook in first 1-2s, fast-paced cuts, trending audio)',
  'tiktok': 'TikTok (9:16 vertical, max 60s, extremely fast hook, pattern interrupts, native-feeling text)',
  'youtube-short': 'YouTube Short (9:16 vertical, max 60s, slightly slower pace than TikTok, subscribe CTA)',
  'facebook-ad': 'Facebook/Instagram Ad (square or 9:16, first 3s critical, clear value prop, strong CTA)',
  'custom': 'Custom format',
};

const SYSTEM_INSTRUCTION = `You are an elite short-form video director and editor for DreamPlay Pianos.
You specialize in high-retention social media content that stops the scroll and drives conversions.
You understand music, emotion, pacing, psychology, and the piano enthusiast audience.
Always return valid JSON only. No markdown, no explanation outside the JSON.

${DREAMPLAY_BRAND_RULES}

VOICEOVER SCRIPT RULES — MANDATORY:
- Never describe piano keys as evenly spaced or all the same width.
- Never suggest camera angles that are physically impossible (e.g. camera inside the piano).
- Never invent product specifications not grounded in the DS5.5/DS6.0/DS6.5 facts above.
- Write scripts in natural spoken English only — no bullet points, no stage directions.
- Every script line must be speakable in the clip's allotted time (approx 2–3 words per second).`;

export async function POST(req: NextRequest) {
  try {
    const body: StoryBuildRequest = await req.json();
    const { intent, format, targetDurationSec, dsModel, campaign, subjects, shotTypes, moods, customNotes, styleProfileId, aiModel } = body;
    const model = aiModel || 'gemini-3.1-pro-preview';

    // Load style profile if provided
    let styleGuide = '';
    if (styleProfileId) {
      try {
        const sp = path.join(process.cwd(), 'data', 'styles', `${styleProfileId}.json`);
        if (fs.existsSync(sp)) {
          const profile = JSON.parse(fs.readFileSync(sp, 'utf-8'));
          if (profile.status === 'ready' && profile.styleSummary) {
            styleGuide = `\n\n${profile.styleSummary}\n`;
          }
        }
      } catch { /* ignore */ }
    }

    // Fetch assets — if subjects are specified, hard-filter to only those subjects
    // This prevents the AI from picking off-subject clips even when it "tries" to respect intent
    const hasSubjectFilter = subjects && subjects.length > 0;

    let candidateAssets: AssetRecord[] = [];

    if (hasSubjectFilter) {
      // Fetch matching-subject assets first
      for (const subj of subjects!) {
        const { assets } = await queryAssets({
          subject: subj,
          dsModel: dsModel || undefined,
          campaign: campaign || undefined,
          limit: 40,
        });
        candidateAssets.push(...assets);
      }
      // Deduplicate by id
      const seen = new Set<string>();
      candidateAssets = candidateAssets.filter(a => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
    }

    // Fall back to all assets if subject filter returned too few (< 6 clips)
    if (candidateAssets.length < 6) {
      const { assets: allAssets } = await queryAssets({
        dsModel: dsModel || undefined,
        campaign: campaign || undefined,
        limit: 80,
      });
      candidateAssets = allAssets;
    }

    // Score and rank — matching subjects still get a priority boost
    const scored = candidateAssets
      .map(a => ({
        asset: a,
        score:
          (a.finalStatus === 'final' ? 100 : a.finalStatus === 'intermediate' ? 50 : 10) +
          (a.priority === 'high' ? 60 : 0) +
          (subjects?.includes(a.subject) ? 40 : 0) +
          (shotTypes?.includes(a.shotType) ? 20 : 0) +
          (a.durationSeconds && a.durationSeconds > 2 && a.durationSeconds < 30 ? 20 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    const assetSummaries = scored.map((s, i) => {
      const a = s.asset;
      const dur = a.durationSeconds ? `${a.durationSeconds.toFixed(1)}s` : '?s';
      // Keep descriptions short to reduce token usage
      const shortDesc = (a.aiDescription || '').slice(0, 80);
      return `[${i}] id:${a.id} subject:${a.subject} shot:${a.shotType} model:${a.dsModel ?? '-'} dur:${dur} status:${a.finalStatus} priority:${a.priority} desc:"${shortDesc}"`;
    }).join('\n');

    const formatDesc = FORMAT_CONTEXT[format] || FORMAT_CONTEXT['custom'];

    const subjectConstraint = hasSubjectFilter
      ? `SUBJECT CONSTRAINT: You MUST only select clips whose subject field matches one of: [${subjects!.join(', ')}]. Do NOT pick clips with other subject values. This is a hard requirement.`
      : '';

    const prompt = `You are building a short-form video for DreamPlay Pianos.
${styleGuide}
FORMAT: ${formatDesc}
TARGET DURATION: ${targetDurationSec} seconds
INTENT: ${intent || 'Showcase the DreamPlay piano and drive interest'}
DS MODEL FOCUS: ${dsModel || 'Any'}
CAMPAIGN: ${campaign || 'General'}
MOOD DIRECTION: ${moods?.join(', ') || 'cinematic, aspirational'}
${subjectConstraint}
${customNotes ? `ADDITIONAL NOTES: ${customNotes}` : ''}

AVAILABLE CLIPS (pick the best ones):
${assetSummaries}

Pick 4–8 clips. Each clip should play 2–6 seconds. Assign roles: hook (first clip, most attention-grabbing), proof (shows the product/hands), demo (demonstrates value), emotion (creates feeling), cta (call to action, last clip).

Return ONLY this JSON structure:
{
  "selectedAssetIds": ["id1", "id2", ...],
  "storyboard": [
    {
      "assetId": "...",
      "order": 1,
      "role": "hook",
      "suggestedStartSec": 0,
      "suggestedEndSec": 3,
      "scriptLine": "One sentence voiceover for this clip",
      "overlayText": "Short snappy text to show on screen (max 6 words)",
      "overlayPlacement": "bottom",
      "overlayStyle": "headline",
      "transitionNote": "cut / smash cut / dissolve / etc"
    }
  ],
  "hookLine": "The opening line that stops the scroll (max 8 words)",
  "callToAction": "The final CTA text",
  "fullScript": "Full voiceover script as one continuous paragraph",
  "voiceoverLines": ["line per clip in order"],
  "textOverlayPlan": [
    { "clipOrder": 1, "text": "...", "placement": "bottom", "style": "headline", "timing": "0s–2s" }
  ],
  "musicSuggestion": {
    "mood": "dark cinematic luxury",
    "bpm": 95,
    "bpmRange": "85–110",
    "energy": "high",
    "genres": ["cinematic trap", "ambient electronic"],
    "trendingSongs": [
      { "title": "Song Name", "artist": "Artist", "why": "Why this fits" }
    ],
    "productionNotes": "Build in first 5s, peak at 15s, fade out last 3s"
  },
  "totalEstimatedDuration": 30,
  "directorNotes": "Overall creative direction note for the editor"
}`;

    const ai = getAI();

    async function callGemini(promptText: string): Promise<string> {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.6,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',  // Forces Gemini to return clean JSON
        },
      });
      return response.text?.trim() ?? '';
    }

    function extractJSON(raw: string): StoryBuildResponse {
      // Strip markdown fences if present
      let text = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
      // Find outermost JSON object
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        text = text.slice(start, end + 1);
      }
      return JSON.parse(text) as StoryBuildResponse;
    }

    let parsed: StoryBuildResponse;
    try {
      const raw = await callGemini(prompt);
      parsed = extractJSON(raw);
    } catch (firstErr) {
      console.warn('[story-build] First attempt failed, retrying once…', String(firstErr));
      // Retry with a slightly simplified prompt to reduce chance of truncation
      try {
        const retryPrompt = prompt + '\n\nIMPORTANT: Respond with ONLY valid JSON. No explanations, no markdown. Start with { and end with }.';
        const raw2 = await callGemini(retryPrompt);
        parsed = extractJSON(raw2);
      } catch (retryErr) {
        console.error('[story-build] Retry also failed:', String(retryErr));
        throw new Error(`Story generation failed after retry. Please try again. (${String(retryErr)})`);
      }
    }

    // ── Post-processing validation ──────────────────────────────────────────
    // 1. Build lookup of valid asset IDs from the scored pool
    const validAssetMap = new Map(scored.map(s => [s.asset.id, s.asset]));
    const validAssetIds = scored.map(s => s.asset.id);

    // 2. Cross-check every storyboard clip — fix hallucinated assetIds
    if (Array.isArray(parsed.storyboard)) {
      parsed.storyboard = parsed.storyboard.map((clip, idx) => {
        if (validAssetMap.has(clip.assetId)) return clip; // valid — keep
        // Hallucinated ID — fall back to the nth asset in the scored pool (wrap around)
        const fallbackId = validAssetIds[idx % validAssetIds.length];
        console.warn(`[story-build] Hallucinated assetId "${clip.assetId}" → replaced with "${fallbackId}"`);
        return { ...clip, assetId: fallbackId };
      });
    }

    // 3. Fix selectedAssetIds to match the corrected storyboard
    parsed.selectedAssetIds = [...new Set(
      (parsed.storyboard ?? []).map((c: StoryboardClip) => c.assetId)
    )];

    // 4. Recalculate totalEstimatedDuration from actual clip timings (never trust LLM math)
    const calculatedDuration = (parsed.storyboard ?? []).reduce((sum, clip) => {
      const dur = (clip.suggestedEndSec ?? 0) - (clip.suggestedStartSec ?? 0);
      return sum + Math.max(0, dur);
    }, 0);
    parsed.totalEstimatedDuration = Math.round(calculatedDuration * 10) / 10;

    // 5. Attach full asset records for selected clips
    const selectedIds = new Set(parsed.selectedAssetIds);
    const selectedAssets = scored.filter(s => selectedIds.has(s.asset.id)).map(s => s.asset);

    return NextResponse.json({ ...parsed, assets: selectedAssets });
  } catch (err) {
    console.error('[story-build]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
