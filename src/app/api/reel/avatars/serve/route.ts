import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const AVATARS_DIR = path.join(process.cwd(), '.indexer-cache', 'avatars');

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const filePath = path.join(AVATARS_DIR, path.basename(name));
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const buf = fs.readFileSync(filePath);
  const ext = name.split('.').pop()?.toLowerCase() || 'jpg';
  const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  const mime = mimeMap[ext] || 'image/jpeg';

  return new NextResponse(buf, { headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' } });
}
