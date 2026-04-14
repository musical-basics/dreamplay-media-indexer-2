# DreamPlay Media Indexer

AI-powered photo & video search and DaVinci Resolve / Final Cut Pro timeline export tool.

## Quick Start

### 1. Install dependencies
```bash
pnpm install
pnpm approve-builds  # approve better-sqlite3, esbuild, protobufjs
```

### 2. Configure `.env.local` (already set up)
```
GEMINI_API_KEY=...
ASSETS_ROOT=/Users/lionelyu/Documents/DreamPlay Assets
CATALOG_DB_PATH=.../.indexer-cache/catalog.db
THUMBS_DIR=.../.indexer-cache/thumbs
LOCAL_WORKSPACE_DIR=/Users/lionelyu/Documents/DreamPlay Assets

NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=dreamplay-assets
NEXT_PUBLIC_R2_PUBLIC_URL=...
```

### 3. Run the ingestion agent

**One-shot full scan (all assets):**
```bash
pnpm ingest
```

**Final clips only (faster for quick load):**
```bash
pnpm ingest --final
```

**Watch mode (auto-index new drops):**
```bash
pnpm watch
```

**Test with first 5 files:**
```bash
pnpm ingest --limit=5
```

### 4. Launch the search UI
```bash
pnpm dev
```
Opens at **http://localhost:3001**

---

## How to Use

### Searching
- Use the **left sidebar** to filter by: Zone (A/B/C), DS Model, Subject, Purpose, Campaign, Shot Type, Status, Color Label, Orientation
- Use the **search bar** to full-text search descriptions, AI keywords, and filenames
- **Color label chips** reflect your Finder labels — red/purple = high priority

### Selecting
- **Click** → single select / toggle
- **Shift+Click** → range select
- **Cmd+Click** → add/remove without deselecting
- **Alt+Click** (or double-click) → open detail modal

### Exporting
Once you have clips selected, the **export tray** appears at the bottom:
- **Export DaVinci XML** → `.xml` file, import via _File → Import Timeline_ in DaVinci Resolve
- **Export FCPXML** → `.fcpxml` file, import via _File → Import_ in Final Cut Pro
- **Copy Paths** → newline-separated list of file paths for Finder / terminal

---

## DreamPlay Taxonomy

| Zone | DS Model | Hand Span |
|------|----------|-----------|
| Zone A | DS5.5® | < 7.6" |
| Zone B | DS6.0® | 7.6"–8.5" |
| Zone C | DS6.5™ | > 8.5" |

## Final Clip Detection Logic

A clip is marked **FINAL** if:
- Path contains: `Resolve Renders`, `Exported Renders`, `Colorgraded Exports`, `Final Cut Export`, `YouTube`, `For Editor`
- File is `.m4v` format
- Clip is ≤ 3.5 seconds AND in a render/export subfolder

A clip is marked **RAW** if:
- Codec is ProRes (`prores`)

## Architecture

```
src/
├── app/
│   ├── page.tsx          ← Main UI (Lightroom-style)
│   ├── globals.css       ← Dark luxury styles
│   └── api/
│       ├── assets/       ← Query endpoint
│       ├── export/       ← DaVinci XML + FCPXML export
│       └── thumb/        ← Thumbnail server
├── lib/
│   ├── taxonomy.ts       ← DreamPlay tag schema
│   ├── db.ts             ← SQLite catalog
│   ├── tagger.ts         ← Gemini Vision AI tagger
│   ├── media-utils.ts    ← ffprobe, thumbnail gen, color labels
│   └── exporters/
│       ├── davinci-xml.ts
│       └── fcpxml.ts
└── scripts/
    └── ingest.ts         ← Ingestion agent
```
