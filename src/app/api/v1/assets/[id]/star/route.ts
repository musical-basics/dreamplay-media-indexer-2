import { NextRequest, NextResponse } from 'next/server';
import { updateAssetStar } from '@/lib/db';

// Agent-facing endpoint — requires API key
// PATCH /api/v1/assets/[id]/star
// Body: { starred: boolean, tag?: string }

const VALID_KEY = process.env.AGENT_API_KEY;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth
  const apiKey = req.headers.get('x-api-key') ?? req.nextUrl.searchParams.get('api_key');
  if (!VALID_KEY) return NextResponse.json({ error: 'Server misconfigured: AGENT_API_KEY not set' }, { status: 500 });
  if (apiKey !== VALID_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    console.error('[API /v1/assets/star] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
