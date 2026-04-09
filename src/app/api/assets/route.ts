import { NextRequest, NextResponse } from 'next/server';
import { queryAssets, getStats, QueryFilters } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const filters: QueryFilters = {
      finalStatus: sp.get('finalStatus') ?? undefined,
      subject: sp.get('subject') ?? undefined,
      handZone: sp.get('handZone') ?? undefined,
      dsModel: sp.get('dsModel') ?? undefined,
      purpose: sp.get('purpose') ?? undefined,
      campaign: sp.get('campaign') ?? undefined,
      shotType: sp.get('shotType') ?? undefined,
      colorLabel: sp.get('colorLabel') ?? undefined,
      priority: sp.get('priority') ?? undefined,
      mediaType: sp.get('mediaType') ?? undefined,
      orientation: sp.get('orientation') ?? undefined,
      search: sp.get('search') ?? undefined,
      minDuration: sp.get('minDuration') ? parseFloat(sp.get('minDuration')!) : undefined,
      maxDuration: sp.get('maxDuration') ? parseFloat(sp.get('maxDuration')!) : undefined,
      limit: sp.get('limit') ? parseInt(sp.get('limit')!) : 1000,
      offset: sp.get('offset') ? parseInt(sp.get('offset')!) : 0,
    };

    const [result, stats] = await Promise.all([queryAssets(filters), getStats()]);

    return NextResponse.json({ ...result, stats });
  } catch (err) {
    console.error('[API /assets] Error:', err);
    return NextResponse.json({ error: 'Failed to query assets' }, { status: 500 });
  }
}
