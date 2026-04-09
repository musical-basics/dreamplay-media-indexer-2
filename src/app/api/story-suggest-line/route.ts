import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

// POST /api/story-suggest-line
// Rewrites a single storyboard clip's scriptLine + overlayText based on a user instruction
export async function POST(req: NextRequest) {
  try {
    const { clip, instruction, contextScript, format } = await req.json();

    const prompt = `You are an elite short-form video director for DreamPlay Pianos.

You are working on a ${format} video. Here is the full script context:
${contextScript}

You need to rewrite ONLY this single clip (#${clip.order}, role: ${clip.role}):
Current voiceover line: "${clip.scriptLine}"
Current on-screen overlay text: "${clip.overlayText ?? ''}"

The user wants this change for this specific clip: "${instruction}"

Return ONLY this JSON:
{
  "scriptLine": "the new voiceover line for this clip",
  "overlayText": "new short on-screen text (max 6 words)",
  "explanation": "one sentence explaining the change you made"
}`;

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
      },
    });

    const raw = response.text?.trim() ?? '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const text = start !== -1 && end > start ? raw.slice(start, end + 1) : raw;
    const result = JSON.parse(text);

    return NextResponse.json(result);
  } catch (err) {
    console.error('[story-suggest-line]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
