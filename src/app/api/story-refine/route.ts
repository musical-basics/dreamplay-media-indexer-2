import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { StoryBuildResponse } from '../story-build/route';
import { DREAMPLAY_BRAND_RULES } from '@/lib/brand-config';

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

interface RefineRequest {
  currentResult: StoryBuildResponse;
  message: string;
  format: string;
  targetDurationSec: number;
}

// POST /api/story-refine
// Takes the current story result + a user refinement message, returns updated story JSON
export async function POST(req: NextRequest) {
  try {
    const body: RefineRequest = await req.json();
    const { currentResult, message, format, targetDurationSec } = body;

    // Strip the assets array (large DB records) — Gemini only needs the story fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { assets: _assets, ...storyOnly } = currentResult as any;
    void _assets; // unused

    // Also slim down storyboard to essential fields only
    const slimStoryboard = (storyOnly.storyboard ?? []).map((c: Record<string, unknown>) => ({
      assetId: c.assetId, order: c.order, role: c.role,
      suggestedStartSec: c.suggestedStartSec, suggestedEndSec: c.suggestedEndSec,
      scriptLine: c.scriptLine, overlayText: c.overlayText,
      overlayPlacement: c.overlayPlacement, overlayStyle: c.overlayStyle,
      transitionNote: c.transitionNote,
    }));

    const slimResult = { ...storyOnly, storyboard: slimStoryboard };

    const prompt = `You are an elite short-form video director for DreamPlay Pianos.

The user has an existing video storyboard they want to refine. Their feedback is:
"${message}"

Current story JSON:
${JSON.stringify(slimResult, null, 2)}

FORMAT: ${format}
TARGET DURATION: ${targetDurationSec}s

Apply the user's requested changes to the story. You can update:
- fullScript and voiceoverLines (rewrite as requested)
- hookLine and callToAction
- overlayText on individual storyboard clips
- musicSuggestion mood/energy/genres/trendingSongs
- directorNotes
- storyboard clip roles, timings, or scriptLines

Keep everything else the same (especially assetId values). Return ONLY the full updated JSON object (same schema as the input).`;

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: `You are an elite video director. Return only valid JSON. No markdown.

${DREAMPLAY_BRAND_RULES}

VOICEOVER SCRIPT RULES — MANDATORY:
- Never describe piano keys as evenly spaced or all the same width.
- Never invent product specifications not grounded in DS5.5/DS6.0/DS6.5 facts.
- Write scripts in natural spoken English only — no bullet points, no stage directions.`,
        temperature: 0.6,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    const raw = response.text?.trim() ?? '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const text = start !== -1 && end > start ? raw.slice(start, end + 1) : raw;
    const updated = JSON.parse(text) as StoryBuildResponse;

    // Generate a brief AI reply summarizing what changed
    const summaryRes = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `You are an AI director chatting with a video creator. They asked you to: "${message}". Respond naturally in 1-2 sentences confirming what you changed and any key creative decisions. Be specific about the change you made.` }] }],
      config: { temperature: 0.7, maxOutputTokens: 300 },
    });
    const aiReply = summaryRes.text?.trim() ?? 'Done! I\'ve updated the story as requested.';

    return NextResponse.json({ updated, aiReply });
  } catch (err) {
    console.error('[story-refine]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
