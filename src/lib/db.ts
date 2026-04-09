import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { AssetRecord } from './taxonomy';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = process.env.CATALOG_DB_PATH!;
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      filePath TEXT UNIQUE NOT NULL,
      fileName TEXT NOT NULL,
      fileSize INTEGER,
      mimeType TEXT,
      mediaType TEXT,
      width INTEGER,
      height INTEGER,
      durationSeconds REAL,
      fps REAL,
      codec TEXT,
      orientation TEXT,
      aspectRatio TEXT,
      subject TEXT DEFAULT 'unknown',
      handZone TEXT,
      dsModel TEXT,
      purpose TEXT DEFAULT 'unknown',
      campaign TEXT DEFAULT 'Other',
      shotType TEXT DEFAULT 'unknown',
      finalStatus TEXT DEFAULT 'raw',
      colorLabel TEXT,
      priority TEXT DEFAULT 'normal',
      mood TEXT DEFAULT '',
      colorGrade TEXT DEFAULT '',
      aiDescription TEXT DEFAULT '',
      aiKeywords TEXT DEFAULT '[]',
      thumbPath TEXT,
      ingestedAt INTEGER,
      updatedAt INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_finalStatus ON assets(finalStatus);
    CREATE INDEX IF NOT EXISTS idx_subject ON assets(subject);
    CREATE INDEX IF NOT EXISTS idx_purpose ON assets(purpose);
    CREATE INDEX IF NOT EXISTS idx_handZone ON assets(handZone);
    CREATE INDEX IF NOT EXISTS idx_dsModel ON assets(dsModel);
    CREATE INDEX IF NOT EXISTS idx_campaign ON assets(campaign);
    CREATE INDEX IF NOT EXISTS idx_priority ON assets(priority);
    CREATE INDEX IF NOT EXISTS idx_colorLabel ON assets(colorLabel);
    CREATE INDEX IF NOT EXISTS idx_mediaType ON assets(mediaType);

    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdAt INTEGER,
      updatedAt INTEGER,
      data TEXT
    );
  `);
}

// ── Draft helpers ─────────────────────────────────────────────────────────

export interface DraftRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  data: string; // JSON blob
}

export function saveDraft(id: string, name: string, data: object): DraftRecord {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO drafts (id, name, createdAt, updatedAt, data)
    VALUES (@id, @name, @createdAt, @updatedAt, @data)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      updatedAt = excluded.updatedAt,
      data = excluded.data
  `).run({ id, name, createdAt: now, updatedAt: now, data: JSON.stringify(data) });
  return db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as DraftRecord;
}

export function listDrafts(): DraftRecord[] {
  return getDb().prepare('SELECT * FROM drafts ORDER BY updatedAt DESC').all() as DraftRecord[];
}

export function getDraft(id: string): DraftRecord | undefined {
  return getDb().prepare('SELECT * FROM drafts WHERE id = ?').get(id) as DraftRecord | undefined;
}

export function deleteDraft(id: string): void {
  getDb().prepare('DELETE FROM drafts WHERE id = ?').run(id);
}

export function upsertAsset(asset: AssetRecord) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO assets (
      id, filePath, fileName, fileSize, mimeType, mediaType,
      width, height, durationSeconds, fps, codec, orientation, aspectRatio,
      subject, handZone, dsModel, purpose, campaign, shotType,
      finalStatus, colorLabel, priority, mood, colorGrade,
      aiDescription, aiKeywords, thumbPath, ingestedAt, updatedAt
    ) VALUES (
      @id, @filePath, @fileName, @fileSize, @mimeType, @mediaType,
      @width, @height, @durationSeconds, @fps, @codec, @orientation, @aspectRatio,
      @subject, @handZone, @dsModel, @purpose, @campaign, @shotType,
      @finalStatus, @colorLabel, @priority, @mood, @colorGrade,
      @aiDescription, @aiKeywords, @thumbPath, @ingestedAt, @updatedAt
    )
    ON CONFLICT(filePath) DO UPDATE SET
      fileSize = excluded.fileSize,
      mimeType = excluded.mimeType,
      width = excluded.width,
      height = excluded.height,
      durationSeconds = excluded.durationSeconds,
      fps = excluded.fps,
      codec = excluded.codec,
      orientation = excluded.orientation,
      aspectRatio = excluded.aspectRatio,
      subject = excluded.subject,
      handZone = excluded.handZone,
      dsModel = excluded.dsModel,
      purpose = excluded.purpose,
      campaign = excluded.campaign,
      shotType = excluded.shotType,
      finalStatus = excluded.finalStatus,
      colorLabel = excluded.colorLabel,
      priority = excluded.priority,
      mood = excluded.mood,
      colorGrade = excluded.colorGrade,
      aiDescription = excluded.aiDescription,
      aiKeywords = excluded.aiKeywords,
      thumbPath = excluded.thumbPath,
      updatedAt = excluded.updatedAt
  `);
  stmt.run(asset);
}

export function getAssetByPath(filePath: string): AssetRecord | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM assets WHERE filePath = ?').get(filePath) as AssetRecord | undefined;
}

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
  limit?: number;
  offset?: number;
}

export function queryAssets(filters: QueryFilters): { assets: AssetRecord[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.finalStatus) { conditions.push('finalStatus = ?'); params.push(filters.finalStatus); }
  if (filters.subject) { conditions.push('subject = ?'); params.push(filters.subject); }
  if (filters.handZone) { conditions.push('handZone = ?'); params.push(filters.handZone); }
  if (filters.dsModel) { conditions.push('dsModel = ?'); params.push(filters.dsModel); }
  if (filters.purpose) { conditions.push('purpose = ?'); params.push(filters.purpose); }
  if (filters.campaign) { conditions.push('campaign = ?'); params.push(filters.campaign); }
  if (filters.shotType) { conditions.push('shotType = ?'); params.push(filters.shotType); }
  if (filters.colorLabel) { conditions.push('colorLabel = ?'); params.push(filters.colorLabel); }
  if (filters.priority) { conditions.push('priority = ?'); params.push(filters.priority); }
  if (filters.mediaType) { conditions.push('mediaType = ?'); params.push(filters.mediaType); }
  if (filters.orientation) { conditions.push('orientation = ?'); params.push(filters.orientation); }
  if (filters.minDuration != null) { conditions.push('durationSeconds >= ?'); params.push(filters.minDuration); }
  if (filters.maxDuration != null) { conditions.push('durationSeconds <= ?'); params.push(filters.maxDuration); }
  if (filters.search) {
    conditions.push('(aiDescription LIKE ? OR aiKeywords LIKE ? OR fileName LIKE ?)');
    const q = `%${filters.search}%`;
    params.push(q, q, q);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as count FROM assets ${where}`).get(...params) as { count: number }).count;

  const limit = filters.limit ?? 200;
  const offset = filters.offset ?? 0;
  const assets = db
    .prepare(`SELECT * FROM assets ${where} ORDER BY priority DESC, finalStatus ASC, updatedAt DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as AssetRecord[];

  return { assets, total };
}

export function getAllAssetsByIds(ids: string[]): AssetRecord[] {
  if (!ids.length) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM assets WHERE id IN (${placeholders})`).all(...ids) as AssetRecord[];
}

export function getStats() {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as count FROM assets').get() as { count: number }).count;
  const finals = (db.prepare("SELECT COUNT(*) as count FROM assets WHERE finalStatus = 'final'").get() as { count: number }).count;
  const highPriority = (db.prepare("SELECT COUNT(*) as count FROM assets WHERE priority = 'high'").get() as { count: number }).count;
  return { total, finals, highPriority };
}
