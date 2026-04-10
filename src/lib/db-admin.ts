import { createClient } from '@supabase/supabase-js';

// Singleton admin client for server-side route handlers
// Uses service-role key with asset_indexer schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabaseAdmin(): any {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _admin = createClient(url, key, { db: { schema: 'asset_indexer' as any }, auth: { persistSession: false } });
  return _admin;
}
