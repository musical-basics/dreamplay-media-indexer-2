import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/v1/assets/upload-url
 *
 * Agent-facing endpoint that returns a presigned Cloudflare R2 URL the caller
 * can PUT a file directly to. After the upload completes, call
 * POST /api/v1/assets with { assetId, fileName, fileUrl, contentType, ... } to
 * register the asset in the index.
 *
 * Auth: X-API-Key header or ?api_key= query param (AGENT_API_KEY).
 *
 * Body: { fileName: string, contentType: string, fileSize?: number }
 * Returns: { presignedUrl, publicUrl, assetId, r2Key, expiresIn }
 */

const VALID_KEY = process.env.AGENT_API_KEY;
const BUCKET = process.env.R2_BUCKET_NAME ?? 'dreamplay-assets';
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

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

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key') ?? req.nextUrl.searchParams.get('api_key');
  if (!VALID_KEY) {
    return NextResponse.json({ error: 'Server misconfigured: AGENT_API_KEY not set' }, { status: 500 });
  }
  if (apiKey !== VALID_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!R2_PUBLIC_URL) {
    return NextResponse.json({ error: 'Server misconfigured: NEXT_PUBLIC_R2_PUBLIC_URL not set' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.fileName !== 'string' || typeof body.contentType !== 'string') {
    return NextResponse.json({ error: 'Body must include fileName (string) and contentType (string)' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(body.contentType)) {
    return NextResponse.json({ error: `Unsupported contentType: ${body.contentType}` }, { status: 400 });
  }

  try {
    const assetId = uuidv4();
    const isVideo = body.contentType.startsWith('video') || body.contentType === 'application/mxf';
    const prefix = isVideo ? 'videos' : 'images';
    const safeFileName = String(body.fileName).split(/[/\\]/).pop() ?? String(body.fileName);
    const r2Key = `${prefix}/${assetId}_${safeFileName}`;

    const r2 = getR2Client();
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: r2Key,
      ContentType: body.contentType,
    });

    const expiresIn = 3600;
    const presignedUrl = await getSignedUrl(r2, command, { expiresIn });
    const publicUrl = `${R2_PUBLIC_URL}/${r2Key}`;

    return NextResponse.json({ presignedUrl, publicUrl, assetId, r2Key, expiresIn });
  } catch (err) {
    console.error('[API /v1/assets/upload-url]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
