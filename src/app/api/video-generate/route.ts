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

const OUTPUT_DIR = path.join(process.cwd(), 'data', 'generated-clips');

interface VideoGenRequest {
  model: 'veo-003' | 'runway-gen4';
  prompt: string;
  clipRole?: string;         // hook, demo, emotion, cta — to tune the prompt
  aspectRatio?: '9:16' | '16:9' | '1:1';
  durationSeconds?: number;  // 5-8 recommended for Veo 3
}

// POST /api/video-generate
export async function POST(req: NextRequest) {
  try {
    const body: VideoGenRequest = await req.json();
    const { model, prompt, clipRole, aspectRatio = '9:16', durationSeconds = 6 } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (model === 'veo-003') {
      return await generateWithVeo3({ prompt, clipRole, aspectRatio, durationSeconds });
    } else if (model === 'runway-gen4') {
      return await generateWithRunway({ prompt, aspectRatio, durationSeconds });
    } else {
      return NextResponse.json({ error: `Unknown model: ${model}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[video-generate]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function generateWithVeo3({ prompt, clipRole, aspectRatio, durationSeconds }: {
  prompt: string; clipRole?: string; aspectRatio: string; durationSeconds: number;
}) {
  const ai = getAI();

  // Enrich prompt based on clip role
  const ROLE_PREFIXES: Record<string, string> = {
    hook: 'Cinematic attention-grabbing opening shot, high energy: ',
    demo: 'Product demonstration close-up, elegant lighting: ',
    emotion: 'Emotional lifestyle moment, warm and authentic: ',
    proof: 'Social proof or testimonial-style shot: ',
    cta: 'Motivational closing shot with strong visual energy: ',
  };
  const enrichedPrompt = (clipRole && ROLE_PREFIXES[clipRole] ? ROLE_PREFIXES[clipRole] : '') +
    `DreamPlay Pianos brand video, high production quality, ${prompt}`;

  // Generate video using Veo 3
  let operation = await ai.models.generateVideos({
    model: 'veo-003',
    prompt: enrichedPrompt,
    config: {
      aspectRatio: aspectRatio as '9:16' | '16:9' | '1:1',
      durationSeconds: Math.min(Math.max(durationSeconds, 5), 8),
    },
  });

  // Poll for completion (Veo 3 is async, can take 2-5 mins)
  let attempts = 0;
  while (!operation.done && attempts < 40) {
    await new Promise(r => setTimeout(r, 10000)); // poll every 10s
    operation = await ai.operations.getVideosOperation({ operation });
    attempts++;
  }

  if (!operation.done) {
    return NextResponse.json({ error: 'Veo 3 generation timed out (>6 min). Try polling /api/video-status.' }, { status: 408 });
  }

  // Save each generated video
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const savedFiles: string[] = [];
  for (const generatedVideo of operation.response?.generatedVideos ?? []) {
    const videoData = generatedVideo.video;
    if (!videoData?.uri) continue;

    // Download the video from the URI
    const videoRes = await fetch(videoData.uri, {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    });
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    const fileName = `veo3_${Date.now()}_${savedFiles.length}.mp4`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(filePath, buffer);
    savedFiles.push(filePath);
  }

  if (savedFiles.length === 0) {
    return NextResponse.json({ error: 'Veo 3 returned no videos' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    model: 'veo-003',
    files: savedFiles,
    prompt: enrichedPrompt,
  });
}

async function generateWithRunway({ prompt, aspectRatio, durationSeconds }: {
  prompt: string; aspectRatio: string; durationSeconds: number;
}) {
  const runwayKey = process.env.RUNWAY_API_KEY;
  if (!runwayKey) {
    return NextResponse.json({
      error: 'RUNWAY_API_KEY is not set. Add it to .env.local to use Runway Gen-4.',
    }, { status: 400 });
  }

  // Runway Gen-4 REST API
  const ratio = aspectRatio === '9:16' ? '720:1280' : aspectRatio === '1:1' ? '1280:1280' : '1280:720';
  const body = {
    promptText: `DreamPlay Pianos brand video. High production quality. ${prompt}`,
    model: 'gen4_turbo',
    ratio,
    duration: Math.min(Math.max(durationSeconds, 5), 10),
  };

  const res = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${runwayKey}`,
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Runway API error: ${err}` }, { status: res.status });
  }

  const task = await res.json();

  // Poll for task completion
  let taskData = task;
  let attempts = 0;
  while (taskData.status !== 'SUCCEEDED' && taskData.status !== 'FAILED' && attempts < 40) {
    await new Promise(r => setTimeout(r, 8000));
    const pollRes = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task.id}`, {
      headers: { 'Authorization': `Bearer ${runwayKey}`, 'X-Runway-Version': '2024-11-06' },
    });
    taskData = await pollRes.json();
    attempts++;
  }

  if (taskData.status === 'FAILED') {
    return NextResponse.json({ error: `Runway generation failed: ${taskData.failure ?? ''}` }, { status: 500 });
  }
  if (taskData.status !== 'SUCCEEDED') {
    return NextResponse.json({ error: 'Runway generation timed out' }, { status: 408 });
  }

  const videoUrl = taskData.output?.[0];
  if (!videoUrl) return NextResponse.json({ error: 'Runway returned no output' }, { status: 500 });

  // Download and save
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const videoRes = await fetch(videoUrl);
  const buffer = Buffer.from(await videoRes.arrayBuffer());
  const fileName = `runway_${Date.now()}.mp4`;
  const filePath = path.join(OUTPUT_DIR, fileName);
  fs.writeFileSync(filePath, buffer);

  return NextResponse.json({ ok: true, model: 'runway-gen4', files: [filePath], prompt });
}
