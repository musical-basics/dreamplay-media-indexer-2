import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const thumbPath = req.nextUrl.searchParams.get('path');
    if (!thumbPath) {
      return NextResponse.json({ error: 'No path' }, { status: 400 });
    }

    // Security: only allow paths within our thumbs dir or assets dir
    const THUMBS_DIR = process.env.THUMBS_DIR ?? '';
    const ASSETS_ROOT = process.env.ASSETS_ROOT ?? '';
    const allowed = thumbPath.startsWith(THUMBS_DIR) || thumbPath.startsWith(ASSETS_ROOT);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!fs.existsSync(thumbPath)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const ext = path.extname(thumbPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    const mime = mimeMap[ext] ?? 'image/jpeg';
    const data = fs.readFileSync(thumbPath);

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    console.error('[API /thumb] Error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
