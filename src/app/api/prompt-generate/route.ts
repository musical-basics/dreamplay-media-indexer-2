import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
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

export interface PromptGenerateRequest {
  subjectPrompt: string;
  shotTypePrompt: string;
  moodPrompt: string;
  campaignPrompt: string;
  dsModel: string;
  dsModelDescription: string;
  outputFormat: string;
  customNotes: string;
}

const SYSTEM_INSTRUCTION = `You are an expert AI prompt engineer for DreamPlay Pianos.
Your job is to synthesize input ingredients into a single, rich, detailed prompt for an AI image or video generator (e.g. Imagen, Midjourney, Sora, Runway).

Rules:
- Write in imperative/descriptive style, NOT question form
- Do NOT use bullet points or numbered lists — output must be ONE continuous paragraph or two short paragraphs MAX
- Naturally weave all supplied details together without repeating them verbatim
- Always end with the brand guardrails in a natural way, integrated into the prompt flow
- Output ONLY the final prompt text — no preamble, no explanation, no quotes`;

export async function POST(req: NextRequest) {
  try {
    const body: PromptGenerateRequest = await req.json();
    const {
      subjectPrompt,
      shotTypePrompt,
      moodPrompt,
      campaignPrompt,
      dsModel,
      dsModelDescription,
      outputFormat,
      customNotes,
    } = body;

    const ai = getAI();

    const ingredients = [
      subjectPrompt && `SUBJECT: ${subjectPrompt}`,
      dsModel && `DS MODEL: ${dsModel} — ${dsModelDescription}`,
      shotTypePrompt && `SHOT TYPE: ${shotTypePrompt}`,
      moodPrompt && `MOOD/STYLE: ${moodPrompt}`,
      campaignPrompt && `CAMPAIGN CONTEXT: ${campaignPrompt}`,
      outputFormat && `OUTPUT FORMAT: ${outputFormat}`,
      customNotes && `ADDITIONAL NOTES FROM USER: ${customNotes}`,
    ].filter(Boolean).join('\n');

    const userMessage = `
Synthesize the following ingredients into a single, polished AI generation prompt for DreamPlay Pianos.
Make it vivid, specific, and production-ready. Naturally incorporate the brand guardrails below.

--- INGREDIENTS ---
${ingredients}

--- BRAND GUARDRAILS TO INCORPORATE ---
${DREAMPLAY_BRAND_RULES}

Write the final prompt now:
`.trim();

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        maxOutputTokens: 600,
      },
    });

    const prompt = response.text?.trim() ?? '';
    if (!prompt) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 500 });
    }

    return NextResponse.json({ prompt });
  } catch (err) {
    console.error('[prompt-generate]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
