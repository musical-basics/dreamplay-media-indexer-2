import { createClient } from '@supabase/supabase-js';
import { AssetRecord } from './taxonomy';

// ── Supabase client (server-side, service-role only) ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSupabase(): any {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _supabase = createClient(url, key, { db: { schema: 'asset_indexer' as any }, auth: { persistSession: false } });
  return _supabase;
}

// Table name constants
const ASSETS_TABLE = 'assets';
const DRAFTS_TABLE = 'drafts';

// ── Draft types ───────────────────────────────────────────────────────────────

export interface DraftRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  data: string; // JSON blob
}

// ── Draft helpers ─────────────────────────────────────────────────────────────

export async function saveDraft(id: string, name: string, data: object): Promise<DraftRecord> {
  const supabase = getSupabase();
  const now = Date.now();
  const row = { id, name, createdAt: now, updatedAt: now, data: JSON.stringify(data) };

  const { data: saved, error } = await supabase
    .from(DRAFTS_TABLE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(row as any, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(`saveDraft failed: ${error.message}`);
  return saved as DraftRecord;
}

export async function listDrafts(): Promise<DraftRecord[]> {
  const { data, error } = await getSupabase()
    .from(DRAFTS_TABLE)
    .select('*')
    .order('updatedAt', { ascending: false });

  if (error) throw new Error(`listDrafts failed: ${error.message}`);
  return (data ?? []) as DraftRecord[];
}

export async function getDraft(id: string): Promise<DraftRecord | undefined> {
  const { data, error } = await getSupabase()
    .from(DRAFTS_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`getDraft failed: ${error.message}`);
  return (data ?? undefined) as DraftRecord | undefined;
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await getSupabase().from(DRAFTS_TABLE).delete().eq('id', id);
  if (error) throw new Error(`deleteDraft failed: ${error.message}`);
}

// ── Asset helpers ─────────────────────────────────────────────────────────────

export async function upsertAsset(asset: AssetRecord): Promise<void> {
  const { error } = await getSupabase()
    .from(ASSETS_TABLE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(asset as any, { onConflict: 'filePath' });

  if (error) throw new Error(`upsertAsset failed: ${error.message}`);
}

export async function getAssetByPath(filePath: string): Promise<AssetRecord | undefined> {
  const { data, error } = await getSupabase()
    .from(ASSETS_TABLE)
    .select('*')
    .eq('filePath', filePath)
    .maybeSingle();

  if (error) throw new Error(`getAssetByPath failed: ${error.message}`);
  return (data ?? undefined) as AssetRecord | undefined;
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export interface QueryFilters {
  finalStatus?: string;
  subject?: string;
  handZone?: string;
  dsModel?: string;
  purpose?: string;
  campaign?: string;
  shotType?: string;
  colorLabel?: string;
  priority?: string;
  mediaType?: string;
  orientation?: string;
  search?: string;
  minDuration?: number;
  maxDuration?: number;
  starred?: boolean;
  starredFor?: string;
  limit?: number;
  offset?: number;
}

export async function queryAssets(
  filters: QueryFilters,
): Promise<{ assets: AssetRecord[]; total: number }> {
  const supabase = getSupabase();
  const limit = filters.limit ?? 200;
  const offset = filters.offset ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dataQ: any = supabase
    .from(ASSETS_TABLE)
    .select('*')
    .order('priority', { ascending: false })
    .order('finalStatus', { ascending: true })
    .order('updatedAt', { ascending: false })
    .range(offset, offset + limit - 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let countQ: any = supabase
    .from(ASSETS_TABLE)
    .select('*', { count: 'exact', head: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(q: any): any {
    if (filters.finalStatus) q = q.eq('finalStatus', filters.finalStatus);
    if (filters.subject)     q = q.eq('subject', filters.subject);
    if (filters.handZone)    q = q.eq('handZone', filters.handZone);
    if (filters.dsModel)     q = q.eq('dsModel', filters.dsModel);
    if (filters.purpose)     q = q.eq('purpose', filters.purpose);
    if (filters.campaign)    q = q.eq('campaign', filters.campaign);
    if (filters.shotType)    q = q.eq('shotType', filters.shotType);
    if (filters.colorLabel)  q = q.eq('colorLabel', filters.colorLabel);
    if (filters.priority)    q = q.eq('priority', filters.priority);
    if (filters.mediaType)   q = q.eq('mediaType', filters.mediaType);
    if (filters.orientation) q = q.eq('orientation', filters.orientation);
    if (filters.minDuration != null) q = q.gte('durationSeconds', filters.minDuration);
    if (filters.maxDuration != null) q = q.lte('durationSeconds', filters.maxDuration);
    if (filters.starred === true)  q = q.eq('starred', true);
    if (filters.starred === false) q = q.eq('starred', false);
    if (filters.starredFor) q = q.ilike('starredFor', `%${filters.starredFor}%`);
    if (filters.search) {
      const term = `%${filters.search}%`;
      q = q.or(`aiDescription.ilike.${term},aiKeywords.ilike.${term},fileName.ilike.${term}`);
    }
    return q;
  }

  dataQ  = applyFilters(dataQ);
  countQ = applyFilters(countQ);

  const [{ data, error: dataErr }, { count, error: countErr }] = await Promise.all([
    dataQ,
    countQ,
  ]);

  if (dataErr)  throw new Error(`queryAssets (data) failed: ${dataErr.message}`);
  if (countErr) throw new Error(`queryAssets (count) failed: ${countErr.message}`);

  return { assets: (data ?? []) as AssetRecord[], total: count ?? 0 };
}

export async function getAllAssetsByIds(ids: string[]): Promise<AssetRecord[]> {
  if (!ids.length) return [];
  const { data, error } = await getSupabase()
    .from(ASSETS_TABLE)
    .select('*')
    .in('id', ids);

  if (error) throw new Error(`getAllAssetsByIds failed: ${error.message}`);
  return (data ?? []) as AssetRecord[];
}

export async function getStats(): Promise<{ total: number; finals: number; highPriority: number }> {
  const supabase = getSupabase();

  const [
    { count: total, error: e1 },
    { count: finals, error: e2 },
    { count: highPriority, error: e3 },
  ] = await Promise.all([
    supabase.from(ASSETS_TABLE).select('*', { count: 'exact', head: true }),
    supabase.from(ASSETS_TABLE).select('*', { count: 'exact', head: true }).eq('finalStatus', 'final'),
    supabase.from(ASSETS_TABLE).select('*', { count: 'exact', head: true }).eq('priority', 'high'),
  ]);

  if (e1) throw new Error(`getStats (total) failed: ${e1.message}`);
  if (e2) throw new Error(`getStats (finals) failed: ${e2.message}`);
  if (e3) throw new Error(`getStats (highPriority) failed: ${e3.message}`);

  return { total: total ?? 0, finals: finals ?? 0, highPriority: highPriority ?? 0 };
}

// ── Star helpers ──────────────────────────────────────────────────────────────

/**
 * Star or unstar an asset, optionally scoped to a use-case tag.
 * Returns false if asset not found.
 */
export async function updateAssetStar(
  id: string,
  starred: boolean,
  tag?: string,
): Promise<boolean> {
  const supabase = getSupabase();

  // Fetch current star state
  const { data: asset, error: fetchErr } = await supabase
    .from(ASSETS_TABLE)
    .select('id, starred, starredFor')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) throw new Error(`updateAssetStar fetch failed: ${fetchErr.message}`);
  if (!asset) return false; // not found

  let tags: string[] = [];
  try { tags = JSON.parse(asset.starredFor ?? '[]'); } catch { tags = []; }

  let newStarred: boolean;
  if (starred) {
    // Star: add tag if provided
    if (tag && !tags.includes(tag)) tags.push(tag);
    newStarred = true;
  } else if (tag) {
    // Remove only this tag; keep starred if other tags remain
    tags = tags.filter((t: string) => t !== tag);
    newStarred = tags.length > 0;
  } else {
    // Unstar globally
    tags = [];
    newStarred = false;
  }

  const { error: updateErr } = await supabase
    .from(ASSETS_TABLE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ starred: newStarred, starredFor: JSON.stringify(tags) } as any)
    .eq('id', id);

  if (updateErr) throw new Error(`updateAssetStar update failed: ${updateErr.message}`);
  return true;
}
