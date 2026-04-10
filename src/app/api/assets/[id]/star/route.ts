import { NextRequest, NextResponse } from 'next/server';
import { updateAssetStar } from '@/lib/db';

// UI-facing endpoint — same-origin, no separate API key required
// PATCH /api/assets/[id]/star
// Body: { starred: boolean, tag?: string }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);

    if (!body || typeof body.starred !== 'boolean') {
      return NextResponse.json({ error: 'Missing required field: starred (boolean)' }, { status: 400 });
    }

    const tag = typeof body.tag === 'string' && body.tag.trim() ? body.tag.trim() : undefined;
    const found = await updateAssetStar(id, body.starred, tag);

    if (!found) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id, starred: body.starred, tag });
  } catch (err) {
    console.error('[API /assets/star] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
