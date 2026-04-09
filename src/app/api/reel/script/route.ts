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

export async function POST(req: NextRequest) {
  try {
    const { topic, format, targetDurationSec, tone, model } = await req.json();
    if (!topic?.trim()) return NextResponse.json({ error: 'topic is required' }, { status: 400 });

    const aiModel = model || 'gemini-2.5-flash';
    const formatDesc = {
      'instagram-reel': 'Instagram Reel (9:16, fast-paced, hook in first 2 seconds)',
      'tiktok': 'TikTok (ultra-fast hook, native-feeling, casual tone)',
      'youtube-short': 'YouTube Short (slightly slower, subscribe CTA at end)',
      'facebook-ad': 'Facebook Ad (clear value prop, strong single CTA)',
      'custom': 'Social media short video',
    }[format as string] || 'Instagram Reel';

    const toneDesc = {
      narrator: 'professional, authoritative narrator voice',
      conversational: 'warm, casual and conversational — like talking to a friend',
      energetic: 'high energy, enthusiastic, exciting',
      luxury: 'slow, elegant, premium luxury brand voice',
    }[tone as string] || 'professional narrator';

    const prompt = `You are a world-class social media video scriptwriter for DreamPlay Pianos.

Write a voiceover script for a ${formatDesc}.
Topic: ${topic}
Target duration: ${targetDurationSec || 30} seconds (approximately ${Math.round((targetDurationSec || 30) * 2.5)} words)
Tone: ${toneDesc}

Rules:
- Start with a powerful hook that stops the scroll in the first 2 seconds
- Write naturally spoken English — no bullet points, no stage directions
- End with a clear call-to-action
- Write ONLY the words to be spoken, nothing else
- No quotation marks around the script

Output: just the script text, nothing else.`;

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: aiModel,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.8, maxOutputTokens: 1024 },
    });

    const script = response.text?.trim() ?? '';
    if (!script) throw new Error('Empty script returned');

    return NextResponse.json({ script });
  } catch (err) {
    console.error('[reel/script]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
