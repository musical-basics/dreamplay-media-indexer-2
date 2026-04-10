# DreamPlay Media Index — Agent API Reference

**Base URL:** `https://dreamplay-media-indexer.vercel.app`

This API gives you read access to DreamPlay's full media asset library (963 assets: 655 images + 308 videos), indexed with AI-generated tags, descriptions, and cloud storage URLs.

---

## Authentication

All requests require an API key, passed as a header **or** query param:

```
X-API-Key: <AGENT_API_KEY>
# or
?api_key=<AGENT_API_KEY>
```

---

## GET /api/v1/assets

Returns a paginated list of assets matching your filters.

### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `mediaType` | `image` \| `video` | Filter by media type |
| `finalStatus` | `final` \| `raw` \| `intermediate` | Filter by production status |
| `subject` | string | `hands` `piano` `person` `talking-head` `keyboard` `merch` `abstract` |
| `purpose` | string | `marketing` `education` `product-demo` `lifestyle` `social-reel` |
| `campaign` | string | `DS 5.5` `DS 6.0` `DS 6.5` `CEO Spotlight` `Piano Performance` `YouTube` |
| `dsModel` | string | `DS5.5` `DS6.0` `DS6.5` |
| `shotType` | string | `close-up` `medium` `wide` `overhead` `talking-head` |
| `orientation` | string | `landscape` `portrait` `square` |
| `priority` | string | `high` `normal` `low` |
| `search` | string | Full-text search across description, keywords, filename |
| `limit` | number | Max results (default: 200, max: 1000) |
| `offset` | number | Pagination offset (default: 0) |
| `stats` | `true` | Include aggregate stats in response |

### Response

```json
{
  "total": 655,
  "count": 50,
  "assets": [
    {
      "id": "uuid",
      "fileName": "piano_hands_closeup.jpg",
      "mediaType": "image",
      "subject": "hands",
      "purpose": "marketing",
      "campaign": "DS 6.0",
      "dsModel": "DS6.0",
      "shotType": "close-up",
      "orientation": "landscape",
      "finalStatus": "final",
      "priority": "high",
      "aiDescription": "An overhead shot of hands playing a black DreamPlay DS 6.0...",
      "aiKeywords": "[\"piano\",\"hands\",\"close-up\",\"DS6.0\"]",
      "thumbPath": "https://tqhfpcdqxylrknwbrqqi.supabase.co/storage/v1/object/public/thumbnails/uuid.jpg",
      "fileUrl": "https://pub-ae162277c7104eb2b558af08104deafc.r2.dev/images/piano_hands_closeup.jpg",
      "filePath": "/Users/lionelyu/Documents/DreamPlay Assets/...",
      "width": 3840,
      "height": 2160,
      "fileSize": 4200000
    }
  ]
}
```

### Key Fields for Agents

| Field | Use |
|-------|-----|
| `thumbPath` | Preview thumbnail — pass to vision model for quick scanning |
| `fileUrl` | Full-resolution image on Cloudflare R2 — use for downloads or generation inputs (images only) |
| `aiDescription` | 1–2 sentence description of the asset |
| `aiKeywords` | JSON array of tags |
| `filePath` | Local disk path (for on-machine use only) |

---

## Example Requests

**All final portrait images for marketing:**
```
GET /api/v1/assets?mediaType=image&finalStatus=final&orientation=portrait&purpose=marketing
X-API-Key: <key>
```

**High-priority DS 6.0 close-ups:**
```
GET /api/v1/assets?mediaType=image&dsModel=DS6.0&shotType=close-up&priority=high
X-API-Key: <key>
```

**Search + include stats:**
```
GET /api/v1/assets?search=piano+hands&stats=true
X-API-Key: <key>
```

**Paginate through all images:**
```
GET /api/v1/assets?mediaType=image&limit=100&offset=0
GET /api/v1/assets?mediaType=image&limit=100&offset=100
...
```

---

## Downloading an Image

Once you have an asset, download directly from `fileUrl` (no auth required):

```python
import requests

# 1. Query for assets
res = requests.get(
    "https://dreamplay-media-indexer.vercel.app/api/v1/assets",
    params={"mediaType": "image", "subject": "hands", "finalStatus": "final", "limit": 10},
    headers={"X-API-Key": "<AGENT_API_KEY>"}
)
assets = res.json()["assets"]

# 2. Download the first image
image_url = assets[0]["fileUrl"]
img_data = requests.get(image_url).content  # public URL, no auth needed
```

---

## Asset Counts (as of April 2026)

| Type | Count |
|------|-------|
| Total assets | 963 |
| Images | 655 |
| Videos | 308 |
| Finals | ~134 |
| High priority | ~2 |
