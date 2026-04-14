import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

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

const BUCKET = process.env.R2_BUCKET_NAME ?? 'dreamplay-assets';
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL!;

const ALLOWED_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/x-msvideo',
  'video/x-matroska',
  'application/mxf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/tiff',
]);

export async function POST(req: NextRequest) {
  try {
    const { fileName, contentType } = await req.json();

    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'Missing fileName or contentType' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json({ error: `Unsupported file type: ${contentType}` }, { status: 400 });
    }
    if (!R2_PUBLIC_URL) {
      return NextResponse.json({ error: 'Missing NEXT_PUBLIC_R2_PUBLIC_URL' }, { status: 500 });
    }

    const assetId = uuidv4();
    const isVideo = contentType.startsWith('video');
    const prefix = isVideo ? 'videos' : 'images';
    const safeFileName = String(fileName).split(/[/\\]/).pop() ?? String(fileName);
    const r2Key = `${prefix}/${assetId}_${safeFileName}`;

    const r2 = getR2Client();
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: r2Key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });
    const publicUrl = `${R2_PUBLIC_URL}/${r2Key}`;

    return NextResponse.json({ presignedUrl, publicUrl, assetId, r2Key });
  } catch (err) {
    console.error('[api/upload/presign]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
