import { NextResponse } from 'next/server';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? 'http://localhost:3001/api/spotify/callback';
const SCOPES = 'streaming user-read-email user-read-private';

export async function GET() {
  if (!CLIENT_ID) {
    return NextResponse.json({ error: 'SPOTIFY_CLIENT_ID not configured in .env.local' }, { status: 500 });
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    show_dialog: 'true',
  });
  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`);
}
