import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { getSupabaseAdmin } from '@/lib/db-admin';

const DEFAULT_WORKSPACE = path.join(
  process.env.HOME ?? '/tmp',
  'Documents',
  'DreamPlay Assets',
);
const WORKSPACE = process.env.LOCAL_WORKSPACE_DIR ?? DEFAULT_WORKSPACE;

export async function POST(req: NextRequest) {
  try {
    const { assetId } = await req.json();
    if (!assetId || typeof assetId !== 'string') {
      return NextResponse.json({ error: 'Missing assetId' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: asset, error } = await supabase
      .from('assets')
      .select('fileName, fileUrl')
      .eq('id', assetId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const fileName = path.basename(asset.fileName as string);
    const fileUrl = asset.fileUrl as string | null;
    const localName = `${assetId}_${fileName}`;
    const localPath = path.join(WORKSPACE, localName);

    if (fs.existsSync(localPath)) {
      await revealInFinder(localPath);
      return NextResponse.json({ ok: true, cached: true });
    }

    if (!fileUrl) {
      return NextResponse.json({ error: 'No cloud URL for this asset' }, { status: 422 });
    }

    fs.mkdirSync(WORKSPACE, { recursive: true });
    const r2Res = await fetch(fileUrl);
    if (!r2Res.ok || !r2Res.body) {
      return NextResponse.json({ error: 'Failed to fetch from R2' }, { status: 502 });
    }

    const tmpPath = `${localPath}.downloading`;
    const fileStream = fs.createWriteStream(tmpPath);
    await pipeline(Readable.fromWeb(r2Res.body as never), fileStream);
    fs.renameSync(tmpPath, localPath);

    await revealInFinder(localPath);
    return NextResponse.json({ ok: true, cached: false });
  } catch (err) {
    console.error('[api/reveal]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function revealInFinder(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('open', ['-R', filePath], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
