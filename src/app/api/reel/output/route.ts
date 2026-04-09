import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), '.indexer-cache', 'reel-output');
const AUDIO_DIR = path.join(process.cwd(), '.indexer-cache', 'reel-audio');

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  const type = req.nextUrl.searchParams.get('type') || 'output'; // 'output' | 'audio'
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const dir = type === 'audio' ? AUDIO_DIR : OUTPUT_DIR;
  const filePath = path.join(dir, path.basename(name));
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const dl = req.nextUrl.searchParams.get('dl') === '1';
  const buf = fs.readFileSync(filePath);
  const ext = name.split('.').pop()?.toLowerCase() || 'mp4';
  const mimeMap: Record<string, string> = {
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg',
  };
  const mime = mimeMap[ext] || 'application/octet-stream';

  return new NextResponse(buf, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': dl ? `attachment; filename="${name}"` : `inline; filename="${name}"`,
      'Cache-Control': 'no-cache',
    },
  });
}
