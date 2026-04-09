import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';

// POST /api/reveal  body: { path: "/absolute/path/to/file" }
// Opens macOS Finder and highlights the file
export async function POST(req: NextRequest) {
  try {
    const { path: filePath } = await req.json();
    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    await new Promise<void>((resolve, reject) => {
      // `open -R` reveals and selects the file in Finder
      execFile('open', ['-R', filePath], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/reveal]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
