import { NextRequest, NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSupabaseAdmin } from '@/lib/db-admin';

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

// PATCH /api/assets/[id] — update editable metadata fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    const allowed = [
      'finalStatus', 'priority', 'subject', 'handZone', 'dsModel',
      'shotType', 'purpose', 'campaign', 'colorLabel', 'orientation',
      'aiDescription', 'aiKeywords', 'mood', 'colorGrade',
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { error } = await supabase.from('assets').update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, id, updated: updates });
  } catch (err) {
    console.error('[API PATCH /assets/id] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/assets/[id]
// 1. Deletes the original file from Cloudflare R2
// 2. Deletes the thumbnail from Supabase Storage
// 3. Removes the record from asset_indexer.assets
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: asset, error: fetchErr } = await supabase
      .from('assets')
      .select('id, fileName, fileUrl, thumbPath')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const errors: string[] = [];

    const fileUrl = asset.fileUrl as string | null;
    if (fileUrl) {
      try {
        const r2 = getR2Client();
        const urlPath = new URL(fileUrl).pathname.replace(/^\//, '');
        await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: urlPath }));
      } catch (e) {
        console.error('[DELETE] R2 delete failed:', e);
        errors.push('R2 delete failed');
      }
    }

    const thumbPath = asset.thumbPath as string | null;
    if (thumbPath && thumbPath.includes('supabase.co/storage')) {
      try {
        const thumbFilename = thumbPath.split('/').pop()!;
        const { error: storErr } = await supabase.storage.from('thumbnails').remove([thumbFilename]);
        if (storErr) errors.push(`Thumb delete failed: ${storErr.message}`);
      } catch (e) {
        console.error('[DELETE] Supabase Storage delete failed:', e);
        errors.push('Thumb storage delete failed');
      }
    }

    const { error: dbErr } = await supabase.from('assets').delete().eq('id', id);
    if (dbErr) return NextResponse.json({ error: `DB delete failed: ${dbErr.message}` }, { status: 500 });

    return NextResponse.json({ success: true, id, warnings: errors.length ? errors : undefined });
  } catch (err) {
    console.error('[API DELETE /assets/id] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
