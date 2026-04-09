import { NextRequest, NextResponse } from 'next/server';
import { saveDraft, listDrafts, getDraft, deleteDraft } from '@/lib/db';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (id) {
    const draft = getDraft(id);
    if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ...draft, data: JSON.parse(draft.data) });
  }
  const drafts = listDrafts().map(d => ({
    id: d.id,
    name: d.name,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    // Don't send full data in list — just metadata
  }));
  return NextResponse.json({ drafts });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, name, data } = body;
  if (!name || !data) {
    return NextResponse.json({ error: 'name and data required' }, { status: 400 });
  }
  const draftId = id || randomUUID();
  const saved = saveDraft(draftId, name, data);
  return NextResponse.json({ ...saved, data: JSON.parse(saved.data) });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  deleteDraft(id);
  return NextResponse.json({ ok: true });
}
