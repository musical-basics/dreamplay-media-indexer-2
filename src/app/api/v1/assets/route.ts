import { NextRequest, NextResponse } from 'next/server';
import { queryAssets, getStats, QueryFilters } from '@/lib/db';
import { getSupabaseAdmin } from '@/lib/db-admin';

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

/**
 * POST /api/v1/assets
 *
 * Register an asset in the index. Typically called after PUTting a file to a
 * presigned R2 URL obtained from POST /api/v1/assets/upload-url, but you can
 * also register an asset that already lives at any public URL.
 *
 * Auth: X-API-Key header or ?api_key= query param (AGENT_API_KEY).
 *
 * Required body fields:
 *   assetId      string  UUID returned from /upload-url, or any unique id
 *   fileName     string  Original filename (used for display + search)
 *   fileUrl      string  Public URL where the file lives (R2 publicUrl)
 *   contentType  string  MIME type — used to derive mediaType
 *
 * Optional body fields (all default to safe values; agents should set what
 * they know):
 *   fileSize, width, height, durationSeconds, fps, codec, orientation,
 *   aspectRatio, subject, purpose, campaign, dsModel, handZone, shotType,
 *   finalStatus, priority, colorLabel, mood, colorGrade, aiDescription,
 *   aiKeywords (string[] or JSON string), thumbPath, filePath
 *
 * Returns: { ok: true, assetId, asset } on success.
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key') ?? req.nextUrl.searchParams.get('api_key');
  if (!VALID_KEY) {
    return NextResponse.json({ error: 'Server misconfigured: AGENT_API_KEY not set' }, { status: 500 });
  }
  if (apiKey !== VALID_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const { assetId, fileName, fileUrl, contentType } = body as Record<string, unknown>;
  if (typeof assetId !== 'string' || typeof fileName !== 'string' || typeof fileUrl !== 'string' || typeof contentType !== 'string') {
    return NextResponse.json(
      { error: 'Missing required fields: assetId, fileName, fileUrl, contentType (all strings)' },
      { status: 400 },
    );
  }

  const isVideo = contentType.startsWith('video') || contentType === 'application/mxf';
  const mediaType = isVideo ? 'video' : 'image';

  const aiKeywords = Array.isArray(body.aiKeywords)
    ? JSON.stringify(body.aiKeywords)
    : typeof body.aiKeywords === 'string'
      ? body.aiKeywords
      : '[]';

  const now = Date.now();
  const row = {
    id: assetId,
    fileName,
    fileUrl,
    filePath: typeof body.filePath === 'string' ? body.filePath : `r2://${fileUrl}`,
    fileSize: typeof body.fileSize === 'number' ? body.fileSize : 0,
    mimeType: contentType,
    mediaType,
    subject: typeof body.subject === 'string' ? body.subject : 'unknown',
    purpose: typeof body.purpose === 'string' ? body.purpose : 'unknown',
    shotType: typeof body.shotType === 'string' ? body.shotType : 'unknown',
    finalStatus: typeof body.finalStatus === 'string' ? body.finalStatus : 'raw',
    priority: typeof body.priority === 'string' ? body.priority : 'normal',
    mood: typeof body.mood === 'string' ? body.mood : '',
    colorGrade: typeof body.colorGrade === 'string' ? body.colorGrade : '',
    aiDescription: typeof body.aiDescription === 'string' ? body.aiDescription : '',
    aiKeywords,
    orientation: typeof body.orientation === 'string' ? body.orientation : null,
    aspectRatio: typeof body.aspectRatio === 'string' ? body.aspectRatio : null,
    width: typeof body.width === 'number' ? body.width : null,
    height: typeof body.height === 'number' ? body.height : null,
    durationSeconds: typeof body.durationSeconds === 'number' ? body.durationSeconds : null,
    fps: typeof body.fps === 'number' ? body.fps : null,
    codec: typeof body.codec === 'string' ? body.codec : null,
    handZone: typeof body.handZone === 'string' ? body.handZone : null,
    dsModel: typeof body.dsModel === 'string' ? body.dsModel : null,
    campaign: typeof body.campaign === 'string' ? body.campaign : 'Other',
    colorLabel: typeof body.colorLabel === 'string' ? body.colorLabel : null,
    thumbPath: typeof body.thumbPath === 'string' ? body.thumbPath : null,
    starred: false,
    starredFor: '[]',
    ingestedAt: now,
    updatedAt: now,
  };

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('assets')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error('[API /v1/assets POST] Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, assetId, asset: data });
  } catch (err) {
    console.error('[API /v1/assets POST] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
