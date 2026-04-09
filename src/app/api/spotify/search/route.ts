import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? '';

async function refreshToken(refresh: string): Promise<string | null> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

// GET /api/spotify/search?q=Lost+in+Thought
// Returns: { connected, track: { name, artist, previewUrl, albumArt, spotifyUrl } }
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');

  // Read tokens from cookies
  let access = req.cookies.get('sp_access')?.value ?? '';
  const refresh = req.cookies.get('sp_refresh')?.value ?? '';
  const expiresAt = Number(req.cookies.get('sp_expires')?.value ?? '0');

  if (!access && !refresh) {
    return NextResponse.json({ connected: false });
  }

  // Refresh if expired
  if (Date.now() > expiresAt - 60_000 && refresh) {
    access = (await refreshToken(refresh)) ?? access;
  }

  if (!q) return NextResponse.json({ connected: true, track: null });

  const searchRes = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`,
    { headers: { Authorization: `Bearer ${access}` } }
  );

  if (!searchRes.ok) return NextResponse.json({ connected: true, track: null });

  const data = await searchRes.json();
  const item = data?.tracks?.items?.[0];
  if (!item) return NextResponse.json({ connected: true, track: null });

  const track = {
    name: item.name,
    artist: item.artists?.[0]?.name ?? '',
    previewUrl: item.preview_url ?? null,   // 30-second MP3, no Premium needed
    albumArt: item.album?.images?.[0]?.url ?? null,
    spotifyUrl: item.external_urls?.spotify ?? null,
  };

  return NextResponse.json({ connected: true, track });
}
