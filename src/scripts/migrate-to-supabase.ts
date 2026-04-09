#!/usr/bin/env tsx
/**
 * DreamPlay Media Indexer — SQLite → Supabase Migration Script
 * Usage: pnpm migrate-to-supabase
 *
 * Reads all assets + drafts from the existing SQLite catalog.db and
 * POSTs them to Supabase REST API using the asset_indexer schema
 * (via Content-Profile header, which works with any exposed schema).
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// ── Load .env.local manually ──────────────────────────────────────────────────
const dotenvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(dotenvPath)) {
  const lines = fs.readFileSync(dotenvPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  }
}

// ── Config ────────────────────────────────────────────────────────────────────
const SQLITE_PATH =
  process.env.CATALOG_DB_PATH ??
  '/Users/lionelyu/Documents/DreamPlay Assets/Anti-Gravity Projects/DreamPlay-Media/dreamplay-media-indexer-1/.indexer-cache/catalog.db';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local');
  process.exit(1);
}

if (!fs.existsSync(SQLITE_PATH)) {
  console.error(`❌  SQLite DB not found at: ${SQLITE_PATH}`);
  process.exit(1);
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });

const BATCH_SIZE = 50;

// ── REST upsert via Supabase PostgREST with Content-Profile header ────────────
async function upsertBatchREST(
  table: string,
  rows: object[],
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY!,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'asset_indexer',
      'Accept-Profile': 'asset_indexer',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST to asset_indexer.${table} failed [${res.status}]: ${body}`);
  }
}

// ── Migrate one table ─────────────────────────────────────────────────────────
async function migrateTable(sourceTable: string, targetTable: string, label: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = sqlite.prepare(`SELECT * FROM ${sourceTable}`).all();
  console.log(`📦  ${label}: ${rows.length} rows found in SQLite`);
  if (rows.length === 0) { console.log('   ↳ Nothing to migrate.\n'); return 0; }

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await upsertBatchREST(targetTable, batch);
    done += batch.length;
    process.stdout.write(`\r   ↳ Uploaded ${done}/${rows.length}…`);
  }
  console.log(`\n   ✓ Done.\n`);
  return rows.length;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🎹  DreamPlay — SQLite → Supabase Migration');
  console.log(`   SQLite:    ${SQLITE_PATH}`);
  console.log(`   Supabase:  ${SUPABASE_URL} (schema: asset_indexer)\n`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .all() as any[];

  const tableNames = new Set(tables.map((t) => t.name as string));
  console.log(`📂  Tables in SQLite: ${[...tableNames].join(', ')}\n`);

  let totalAssets = 0;
  let totalDrafts = 0;

  if (tableNames.has('assets')) {
    totalAssets = await migrateTable('assets', 'assets', 'Assets');
  } else {
    console.log('⚠️  No "assets" table found.\n');
  }

  if (tableNames.has('drafts')) {
    totalDrafts = await migrateTable('drafts', 'drafts', 'Drafts');
  } else {
    console.log('ℹ️  No "drafts" table found — skipping.\n');
  }

  sqlite.close();

  console.log(`✅  Migration complete!`);
  console.log(`   Assets migrated: ${totalAssets}`);
  console.log(`   Drafts migrated: ${totalDrafts}\n`);
}

main().catch((err) => {
  console.error('\n❌  Migration failed:', err.message ?? err);
  process.exit(1);
});
