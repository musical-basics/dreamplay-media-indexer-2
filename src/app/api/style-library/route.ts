import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data', 'styles');
function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function profilePath(id: string) { return path.join(DATA_DIR, `${id}.json`); }

export interface StyleProfile {
  id: string;
  name: string;
  createdAt: string;
  sourceType: 'file' | 'url';
  sourceName: string;
  status: 'analyzing' | 'ready' | 'error';
  errorMsg?: string;
  analysis?: {
    hookStyle: string;
    pacing: string;
    shotTypes: string[];
    textOverlayStyle: string;
    toneEnergy: string;
    ctaStyle: string;
    musicStyle: string;
    keyInsights: string[];
    recommendedFor: string;
  };
  styleSummary?: string;
}

// GET /api/style-library — list all profiles
// POST /api/style-library — create empty profile
// DELETE /api/style-library?id= — delete profile
// PATCH /api/style-library?id= { name } — rename

export async function GET() {
  ensureDir();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const profiles: StyleProfile[] = files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')); }
    catch { return null; }
  }).filter(Boolean) as StyleProfile[];
  profiles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ profiles });
}

export async function POST(req: NextRequest) {
  ensureDir();
  const body = await req.json();
  const id = randomUUID();
  const profile: StyleProfile = {
    id,
    name: body.name ?? 'New Style',
    createdAt: new Date().toISOString(),
    sourceType: body.sourceType ?? 'url',
    sourceName: body.sourceName ?? '',
    status: 'analyzing',
  };
  fs.writeFileSync(profilePath(id), JSON.stringify(profile, null, 2));
  return NextResponse.json({ profile });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const p = profilePath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const p = profilePath(id);
  if (!fs.existsSync(p)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const existing: StyleProfile = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const body = await req.json();
  const updated = { ...existing, ...body };
  fs.writeFileSync(p, JSON.stringify(updated, null, 2));
  return NextResponse.json({ profile: updated });
}
