import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db-admin';

// GET /api/assets/[id]/download
// Proxies the R2 file so the browser downloads it directly
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: asset, error } = await supabase
      .from('assets')
      .select('fileName, fileUrl, filePath')
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const url = asset.fileUrl as string | null;
    if (!url) return NextResponse.json({ error: 'No cloud URL for this asset — local file only' }, { status: 422 });

    // Proxy the file from R2
    const r2Res = await fetch(url);
    if (!r2Res.ok) return NextResponse.json({ error: 'Failed to fetch from R2' }, { status: 502 });

    const contentType = r2Res.headers.get('content-type') ?? 'application/octet-stream';
    const buffer = await r2Res.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(asset.fileName as string)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[API /assets/download] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
