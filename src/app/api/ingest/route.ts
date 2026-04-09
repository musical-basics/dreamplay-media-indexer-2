import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

const STATUS_FILE = path.join(process.cwd(), '.indexer-cache', 'scan-status.json');

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    return { status: 'idle', lastScan: null };
  }
}

// GET /api/ingest → returns current scan status
export async function GET() {
  return NextResponse.json(readStatus());
}

// POST /api/ingest → triggers a one-shot rescan in background
export async function POST() {
  const current = readStatus();
  if (current.status === 'scanning') {
    return NextResponse.json({ ok: false, message: 'Scan already in progress' });
  }

  const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'ingest.ts');
  const assetsRoot = process.env.ASSETS_ROOT ?? '/Users/lionelyu/Documents/DreamPlay Assets';

  // Write scanning status immediately
  fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
  fs.writeFileSync(STATUS_FILE, JSON.stringify({ status: 'scanning', lastScan: Date.now() }), 'utf8');

  // Fire and forget — does NOT block the API response
  const child = execFile(tsxBin, [scriptPath], {
    env: { ...process.env, ASSETS_ROOT: assetsRoot },
    cwd: process.cwd(),
  });

  child.on('exit', () => {
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ status: 'idle', lastScan: Date.now() }), 'utf8');
  });

  child.on('error', () => {
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ status: 'idle', lastScan: Date.now() }), 'utf8');
  });

  return NextResponse.json({ ok: true, message: 'Scan started' });
}
