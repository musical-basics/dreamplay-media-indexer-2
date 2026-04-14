import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db-admin';

export async function POST(req: NextRequest) {
  try {
    const { assetId, fileName, fileUrl, contentType, fileSize } = await req.json();

    if (!assetId || !fileName || !fileUrl) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const mediaType = contentType?.startsWith('video') ? 'video' : 'image';

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('assets').upsert({
      id: assetId,
      fileName,
      fileUrl,
      filePath: `r2://${fileUrl}`,
      fileSize: fileSize ?? 0,
      mimeType: contentType ?? 'application/octet-stream',
      mediaType,
      subject: 'unknown',
      purpose: 'unknown',
      shotType: 'unknown',
      finalStatus: 'draft',
      priority: 'normal',
      mood: '',
      colorGrade: '',
      aiDescription: '',
      aiKeywords: '[]',
      orientation: null,
      aspectRatio: null,
      width: null,
      height: null,
      durationSeconds: null,
      fps: null,
      codec: null,
      handZone: null,
      dsModel: null,
      campaign: 'Other',
      colorLabel: null,
      thumbPath: null,
      starred: false,
      starredFor: '[]',
      ingestedAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, assetId });
  } catch (err) {
    console.error('[api/upload/confirm]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
