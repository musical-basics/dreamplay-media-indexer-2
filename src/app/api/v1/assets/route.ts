import { NextRequest, NextResponse } from 'next/server';
import { queryAssets, getStats, QueryFilters } from '@/lib/db';

/**
 * GET /api/v1/assets
 *
 * Agent-facing read-only API to query the DreamPlay media index.
 *
 * Authentication: pass the API key via header or query param:
 *   X-API-Key: <AGENT_API_KEY>   OR   ?api_key=<AGENT_API_KEY>
 *
 * Query params (all optional):
 *   limit         number (default 200, max 1000)
 *   offset        number (default 0)
 *   mediaType     video | image
 *   finalStatus   final | raw | intermediate
 *   subject       string
 *   purpose       string
 *   campaign      string
 *   shotType      string
 *   dsModel       string
 *   handZone      string
 *   priority      high | normal | low
 *   orientation   landscape | portrait | square
 *   search        string (searches AI description + keywords + filename)
 *   stats         true   (include aggregate stats in response)
 *
 * Response:
 * {
 *   total: number,           // total matching rows (for pagination)
 *   count: number,           // rows returned in this response
 *   assets: Asset[],         // full asset records
 *   stats?: { total, finals, highPriority }
 * }
 */

const VALID_KEY = process.env.AGENT_API_KEY;

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const apiKey =
    req.headers.get('x-api-key') ??
    req.nextUrl.searchParams.get('api_key');

  if (!VALID_KEY) {
    return NextResponse.json(
      { error: 'Server misconfigured: AGENT_API_KEY env var not set' },
      { status: 500 },
    );
  }

  if (apiKey !== VALID_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse filters ─────────────────────────────────────────────────────────────
  const p = req.nextUrl.searchParams;
  const includeStats = p.get('stats') === 'true';

  const filters: QueryFilters = {
    limit:       Math.min(Number(p.get('limit') ?? 200), 1000),
    offset:      Number(p.get('offset') ?? 0),
    mediaType:   p.get('mediaType')   ?? undefined,
    finalStatus: p.get('finalStatus') ?? undefined,
    subject:     p.get('subject')     ?? undefined,
    purpose:     p.get('purpose')     ?? undefined,
    campaign:    p.get('campaign')    ?? undefined,
    shotType:    p.get('shotType')    ?? undefined,
    dsModel:     p.get('dsModel')     ?? undefined,
    handZone:    p.get('handZone')    ?? undefined,
    priority:    p.get('priority')    ?? undefined,
    orientation: p.get('orientation') ?? undefined,
    colorLabel:  p.get('colorLabel')  ?? undefined,
    search:      p.get('search')      ?? undefined,
    minDuration: p.get('minDuration') ? Number(p.get('minDuration')) : undefined,
    maxDuration: p.get('maxDuration') ? Number(p.get('maxDuration')) : undefined,
    starred:     p.get('starred') === 'true' ? true : p.get('starred') === 'false' ? false : undefined,
    starredFor:  p.get('starredFor')  ?? undefined,
  };

  // Remove undefined values
  Object.keys(filters).forEach(k => {
    if ((filters as Record<string, unknown>)[k] === undefined) {
      delete (filters as Record<string, unknown>)[k];
    }
  });

  try {
    const [{ assets, total }, stats] = await Promise.all([
      queryAssets(filters),
      includeStats ? getStats() : Promise.resolve(null),
    ]);

    const body: Record<string, unknown> = {
      total,
      count: assets.length,
      assets,
    };

    if (includeStats && stats) {
      body.stats = stats;
    }

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[API /v1/assets] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
