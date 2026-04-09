import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const AVATARS_DIR = path.join(process.cwd(), '.indexer-cache', 'avatars');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export async function GET() {
  ensureDir(AVATARS_DIR);
  const files = fs.readdirSync(AVATARS_DIR).filter(f =>
    /\.(jpg|jpeg|png|webp|gif)$/i.test(f)
  );
  const avatars = files.map(f => ({
    fileName: f,
    filePath: path.join(AVATARS_DIR, f),
    url: `/api/reel/avatars/serve?name=${encodeURIComponent(f)}`,
    uploadedAt: fs.statSync(path.join(AVATARS_DIR, f)).mtimeMs,
  })).sort((a, b) => b.uploadedAt - a.uploadedAt);
  return NextResponse.json({ avatars });
}

export async function POST(req: NextRequest) {
  ensureDir(AVATARS_DIR);
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `avatar_${Date.now()}.${ext}`;
    const filePath = path.join(AVATARS_DIR, fileName);

    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

    return NextResponse.json({
      fileName,
      filePath,
      url: `/api/reel/avatars/serve?name=${encodeURIComponent(fileName)}`,
    });
  } catch (err) {
    console.error('[reel/avatars]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
