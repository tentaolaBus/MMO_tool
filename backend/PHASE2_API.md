# Phase 2 - Clip Detection API Reference

## Endpoints

### 1. Analyze Clips

**Endpoint:** `POST /api/clips/analyze`

Analyzes a transcript and returns clip candidates with scores.

**Request:**
```json
{
  "jobId": "uuid-from-phase-1",
  "maxClips": 10
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid",
  "candidates": [
    {
      "startTime": 12.5,
      "endTime": 45.2,
      "duration": 32.7,
      "text": "Today we're going to talk about success and how to make money...",
      "score": {
        "total": 85,
        "durationScore": 35,
        "keywordScore": 24,
        "completenessScore": 26,
        "keywords": ["success", "money"]
      }
    }
  ],
  "selectedCount": 8
}
```

### 2. Render Clips

**Endpoint:** `POST /api/clips/render`

Generates actual video clip files using FFmpeg.

**Request:**
```json
{
  "jobId": "uuid-from-phase-1",
  "maxClips": 10,
  "clipIndices": [0, 1, 2]  // optional: render specific clips only
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid",
  "clips": [
    {
      "id": "clip-uuid",
      "jobId": "original-uuid",
      "clipIndex": 0,
      "videoPath": "C:\\...\\storage\\clips\\clip_original-uuid_0.mp4",
      "startTime": 12.5,
      "endTime": 45.2,
      "duration": 32.7,
      "text": "...",
      "score": { "total": 85, ... },
      "createdAt": "2026-01-29T..."
    }
  ],
  "count": 3
}
```

### 3. List Clips

**Endpoint:** `GET /api/clips/:jobId`

Lists all generated clips for a job.

**Response:**
```json
{
  "success": true,
  "jobId": "uuid",
  "clips": [
    {
      "filename": "clip_uuid_0.mp4",
      "path": "C:\\...\\storage\\clips\\clip_uuid_0.mp4"
    }
  ],
  "count": 5
}
```

---

## Testing Phase 2

### Prerequisites
1. Complete Phase 1 first (have a job with transcript)
2. Note the `jobId` from Phase 1

### Step 1: Analyze Clips

```bash
curl -X POST http://localhost:3001/api/clips/analyze \
  -H "Content-Type: application/json" \
  -d '{"jobId":"your-job-id","maxClips":10}'
```

### Step 2: Render Clips

```bash
curl -X POST http://localhost:3001/api/clips/render \
  -H "Content-Type: application/json" \
  -d '{"jobId":"your-job-id","maxClips":5}'
```

### Step 3: Check Clips

Generated clips will be in: `backend/storage/clips/`

---

## Scoring Algorithm

### Total Score: 0-100 points

**Duration Score (0-40 points)**
- Ideal: 30-45 seconds
- Formula: `40 - abs(duration - 37.5) * 2`

**Keyword Score (0-30 points)**
- 6 points per viral keyword
- Keywords: money, success, business, life, love, truth, mindset, etc.
- Max: 30 points

**Completeness Score (0-30 points)**
- Starts after pause: +10
- Ends at pause: +10
- Complete sentences: +10

---

## Configuration

Edit `backend/src/services/clipDetector.ts`:

```typescript
const CLIP_CONFIG = {
  minDuration: 20,      // minimum clip length
  maxDuration: 60,      // maximum clip length
  pauseThreshold: 1.2,  // gap to consider as pause
  minClips: 5,
  maxClips: 15
};
```

Edit `backend/src/services/clipScorer.ts` to modify keywords.

---

## Troubleshooting

**No clips generated?**
- Check if video has pauses (silence gaps)
- Try lowering `pauseThreshold`
- Check transcript has enough content

**Clips too short/long?**
- Adjust `minDuration` and `maxDuration` in CLIP_CONFIG

**FFmpeg errors?**
- Ensure FFmpeg is installed
- Check video file exists and is readable
- Try re-encoding instead of `-c copy`
