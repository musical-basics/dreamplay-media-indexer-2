# DreamPlay Media Indexer — Asset Schema

Supabase schema: `asset_indexer` · Table: `assets`

All 963+ media assets live in a single flat table. Use the **filter columns** below to segment them — no need for multiple tables.

---

## Core Identity

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | UUID — stable identifier |
| `filePath` | TEXT (UNIQUE) | Absolute local path to the original file |
| `fileName` | TEXT | Filename only |
| `fileSize` | BIGINT | Bytes |
| `mimeType` | TEXT | e.g. `video/quicktime`, `image/png` |

---

## Media Technical

| Column | Type | Description |
|--------|------|-------------|
| `mediaType` | TEXT | `video` \| `image` |
| `width` | INTEGER | Pixels |
| `height` | INTEGER | Pixels |
| `orientation` | TEXT | `landscape` \| `portrait` \| `square` |
| `aspectRatio` | TEXT | e.g. `16:9`, `9:16`, `1:1` |
| `durationSeconds` | REAL | Video only |
| `fps` | REAL | Video only |
| `codec` | TEXT | Video only (e.g. `h264`) |

---

## 🏷️ Filter / Segmentation Columns

These are the primary differentiators — use these in queries and the agent API.

### `subject` — What's in the shot
| Value | Meaning |
|-------|---------|
| `hands` | Close-up of hands on keys |
| `piano` | Piano body / product |
| `person` | Full person / lifestyle |
| `talking-head` | Speaker direct to camera |
| `keyboard` | Keyboard/keys focus |
| `abstract` | B-roll, texture, abstract |
| `merch` | Merchandise / apparel |
| `unknown` | Not yet classified |

---

### `purpose` — Intended use
| Value | Meaning |
|-------|---------|
| `marketing` | Ads, social, campaigns |
| `education` | Teaching, tutorials |
| `product-demo` | Product walkthrough |
| `lifestyle` | Aspirational / brand |
| `social-reel` | Short-form video |
| `unknown` | Not yet classified |

---

### `campaign` — Campaign bucket
| Value | Meaning |
|-------|---------|
| `DS 5.5` | DS 5.5 model campaign |
| `DS 6.0` | DS 6.0 model campaign |
| `DS 6.5` | DS 6.5 model campaign |
| `CEO Spotlight` | CEO / brand story content |
| `Piano Performance` | Performance footage |
| `YouTube` | YouTube-specific content |
| `Other` | Uncategorized |

---

### `dsModel` — Piano model featured
`DS5.5` · `DS6.0` · `DS6.5` · (null if no specific model)

### `handZone` — Hand position on keyboard
| Value | Range |
|-------|-------|
| `Zone A` | DS 5.5 key range |
| `Zone B` | DS 6.0 key range |
| `Zone C` | DS 6.5 key range |

### `shotType` — Camera framing
`close-up` · `medium` · `wide` · `overhead` · `talking-head` · `unknown`

---

## Status & Priority

| Column | Values | Meaning |
|--------|--------|---------|
| `finalStatus` | `final` \| `raw` \| `intermediate` | Production readiness |
| `priority` | `high` \| `normal` \| `low` | Curation priority |
| `colorLabel` | `red` `orange` `yellow` `green` `blue` `purple` `grey` | Lightroom-style color tag |

---

## AI-Generated Metadata

| Column | Type | Description |
|--------|------|-------------|
| `aiDescription` | TEXT | 1–2 sentence Gemini description |
| `aiKeywords` | TEXT | JSON array of tags e.g. `["piano","hands","close-up"]` |
| `mood` | TEXT | e.g. `warm, natural, soft light` |
| `colorGrade` | TEXT | e.g. `dark, high contrast, blue display accents` |

---

## Cloud Storage URLs

| Column | Storage | Description |
|--------|---------|-------------|
| `thumbPath` | **Supabase Storage** | Public CDN URL for the preview thumbnail JPG |
| `fileUrl` | **Cloudflare R2** | Public CDN URL for the original image file (images only, NULL for videos) |
| `filePath` | Local disk | Absolute local path — used for ingest deduplication and video playback |

> **Agent usage:** Prefer `fileUrl` for images, fall back to `filePath` for videos (local-only).

---

## Timestamps

| Column | Description |
|--------|-------------|
| `ingestedAt` | Unix ms — when first indexed |
| `updatedAt` | Unix ms — last metadata update |

---

## Agent API Quick Reference

```
GET /api/v1/assets
X-API-Key: <AGENT_API_KEY>

Filter params: mediaType, finalStatus, subject, purpose, campaign,
               shotType, dsModel, handZone, priority, orientation,
               colorLabel, search, minDuration, maxDuration,
               limit (max 1000), offset
```

Example — all final portrait videos of hands for marketing:
```
/api/v1/assets?finalStatus=final&mediaType=video&subject=hands&purpose=marketing&orientation=portrait
```
