import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

const OUTPUT_DIR = path.join(process.cwd(), '.indexer-cache', 'reel-output');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export interface ReelGenerateRequest {
  script: string;
  audioPath: string;       // path to TTS-generated audio file
  avatarImagePath: string; // path to uploaded avatar image
  aspectRatio?: '9:16' | '16:9' | '1:1';
  durationSeconds?: number;
  videoPrompt?: string;    // optional override for Veo prompt
}

export async function POST(req: NextRequest) {
  try {
    const body: ReelGenerateRequest = await req.json();
    const { script, audioPath, avatarImagePath, aspectRatio = '9:16', durationSeconds = 15, videoPrompt } = body;

    if (!audioPath || !avatarImagePath) {
      return NextResponse.json({ error: 'audioPath and avatarImagePath are required' }, { status: 400 });
    }
    if (!fs.existsSync(audioPath)) {
      return NextResponse.json({ error: `Audio file not found: ${audioPath}` }, { status: 400 });
    }
    if (!fs.existsSync(avatarImagePath)) {
      return NextResponse.json({ error: `Avatar image not found: ${avatarImagePath}` }, { status: 400 });
    }

    ensureDir(OUTPUT_DIR);
    const timestamp = Date.now();

    // Step 1: Generate talking-head video with Veo (image-to-video)
    const ai = getAI();

    // Read avatar image as base64
    const avatarBuffer = fs.readFileSync(avatarImagePath);
    const avatarBase64 = avatarBuffer.toString('base64');
    const avatarExt = avatarImagePath.split('.').pop()?.toLowerCase() || 'jpg';
    const avatarMime = avatarExt === 'png' ? 'image/png' : avatarExt === 'webp' ? 'image/webp' : 'image/jpeg';

    // Craft a talking-head prompt from the script
    const talkingHeadPrompt = videoPrompt ||
      `Realistic talking head video. The person in the image is speaking directly to camera in a natural, confident manner. ` +
      `Professional lighting, shallow depth of field, social media reel style. ` +
      `The person's mouth is moving as they speak. Authentic conversation energy. ` +
      `Script context: "${script.slice(0, 120)}"`;

    // Generate video using Veo image-to-video
    let operation = await ai.models.generateVideos({
      model: 'veo-003',
      prompt: talkingHeadPrompt,
      image: {
        imageBytes: avatarBase64,
        mimeType: avatarMime,
      },
      config: {
        aspectRatio: aspectRatio as '9:16' | '16:9' | '1:1',
        durationSeconds: Math.min(Math.max(durationSeconds, 5), 30),
      },
    } as Parameters<typeof ai.models.generateVideos>[0]);

    // Poll for completion
    let attempts = 0;
    while (!operation.done && attempts < 60) {
      await new Promise(r => setTimeout(r, 10000)); // poll every 10s
      operation = await ai.operations.getVideosOperation({ operation });
      attempts++;
    }

    if (!operation.done) {
      return NextResponse.json({ error: 'Veo generation timed out. Try again.' }, { status: 408 });
    }

    // Download generated video
    const generatedVideos = operation.response?.generatedVideos ?? [];
    if (generatedVideos.length === 0) {
      return NextResponse.json({ error: 'Veo returned no videos. Try a different avatar image or prompt.' }, { status: 500 });
    }

    const videoUri = generatedVideos[0].video?.uri;
    if (!videoUri) {
      return NextResponse.json({ error: 'Veo returned video without URI' }, { status: 500 });
    }

    const videoRes = await fetch(videoUri, {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    });
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const rawVideoPath = path.join(OUTPUT_DIR, `raw_${timestamp}.mp4`);
    fs.writeFileSync(rawVideoPath, videoBuffer);

    // Step 2: Merge audio onto video using FFmpeg
    const outputFileName = `reel_${timestamp}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, outputFileName);

    // FFmpeg: overlay audio on video, trim/pad video to match audio length, keep video if audio shorter
    const ffmpegCmd = [
      'ffmpeg', '-y',
      '-i', `"${rawVideoPath}"`,       // input video
      '-i', `"${audioPath}"`,           // input audio (TTS)
      '-c:v', 'copy',                   // copy video stream unchanged
      '-c:a', 'aac',                    // encode audio to AAC
      '-b:a', '192k',
      '-map', '0:v:0',                  // use video from input 0
      '-map', '1:a:0',                  // use audio from input 1
      '-shortest',                      // end at the shorter of the two
      `"${outputPath}"`,
    ].join(' ');

    try {
      execSync(ffmpegCmd, { stdio: 'pipe' });
    } catch (ffmpegErr) {
      // If FFmpeg merge fails, return the raw video without audio as fallback
      console.error('[reel/generate] FFmpeg merge failed:', ffmpegErr);
      fs.copyFileSync(rawVideoPath, outputPath);
    }

    // Clean up raw video
    try { fs.unlinkSync(rawVideoPath); } catch { /* ignore */ }

    return NextResponse.json({
      ok: true,
      outputFileName,
      outputPath,
      previewUrl: `/api/reel/output?name=${encodeURIComponent(outputFileName)}`,
      downloadUrl: `/api/reel/output?name=${encodeURIComponent(outputFileName)}&dl=1`,
    });
  } catch (err) {
    console.error('[reel/generate]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
