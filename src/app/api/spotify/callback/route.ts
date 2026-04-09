import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? '';
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? 'http://localhost:3001/api/spotify/callback';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect('http://localhost:3001/?spotify=denied');
  }

  // Exchange code for access + refresh tokens
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect('http://localhost:3001/?spotify=error');
  }

  const tokens = await tokenRes.json();
  const expiresAt = Date.now() + tokens.expires_in * 1000;

  const res = NextResponse.redirect('http://localhost:3001/?spotify=connected');
  const cookieOpts = { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' as const };
  res.cookies.set('sp_access', tokens.access_token, cookieOpts);
  res.cookies.set('sp_refresh', tokens.refresh_token ?? '', cookieOpts);
  res.cookies.set('sp_expires', String(expiresAt), cookieOpts);
  return res;
}
