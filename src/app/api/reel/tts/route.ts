import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
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

// Ensure output dir exists
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export async function POST(req: NextRequest) {
  try {
    const { script, voiceName, model, style } = await req.json();
    if (!script?.trim()) return NextResponse.json({ error: 'script is required' }, { status: 400 });

    const ttsModel = model || 'gemini-2.5-flash-preview-tts';
    const voice = voiceName || 'Kore';

    // Build a style-aware script preamble if style is set
    const styledScript = style && style !== 'narrator'
      ? `[Speak in a ${style} tone] ${script}`
      : script;

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: ttsModel,
      contents: [{ role: 'user', parts: [{ text: styledScript }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      } as Record<string, unknown>,
    });

    // Extract audio data from response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts = response.candidates?.[0]?.content?.parts as any[] | undefined;
    const audioPart = parts?.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData) as
      { inlineData: { mimeType: string; data: string } } | undefined;

    if (!audioPart?.inlineData?.data) {
      throw new Error('No audio data returned from TTS model');
    }

    const audioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
    const mimeType = audioPart.inlineData.mimeType || 'audio/wav';
    const ext = mimeType.includes('mp3') ? 'mp3' : mimeType.includes('ogg') ? 'ogg' : 'wav';

    // Save to disk
    const audioDir = path.join(process.cwd(), '.indexer-cache', 'reel-audio');
    ensureDir(audioDir);
    const fileName = `tts_${Date.now()}.${ext}`;
    const filePath = path.join(audioDir, fileName);
    fs.writeFileSync(filePath, audioBuffer);

    return NextResponse.json({
      audioPath: filePath,
      fileName,
      mimeType,
      sizeBytes: audioBuffer.length,
      durationEstimateSec: Math.round((audioBuffer.length / 16000) * 2), // rough estimate
    });
  } catch (err) {
    console.error('[reel/tts]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
