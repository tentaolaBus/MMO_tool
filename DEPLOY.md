# Deployment Guide — MMO Video Clipper

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Frontend   │────▶│    Backend      │────▶│   AI Service     │
│  (Next.js)  │     │  (Express.js)   │     │  (Flask/Whisper) │
│   Vercel    │     │  Render Docker  │     │  Render Docker   │
└─────────────┘     └────────┬────────┘     └──────────────────┘
                             │
                    ┌────────▼────────┐
                    │    Supabase     │
                    │   (Postgres)    │
                    └─────────────────┘
```

## Prerequisites

1. **GitHub repo** with code pushed
2. **Supabase project** at [supabase.com](https://supabase.com)
3. **Vercel account** at [vercel.com](https://vercel.com) (linked to GitHub)
4. **Render account** at [render.com](https://render.com) (linked to GitHub)

---

## Step 1: Supabase Setup

1. Go to **Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY`

2. Go to **Authentication → URL Configuration**:
   - Site URL = your Vercel frontend URL (e.g. `https://mmo-clipper.vercel.app`)
   - Redirect URLs = `https://mmo-clipper.vercel.app/**`

3. Enable **RLS** on all tables in Table Editor → RLS tab

---

## Step 2: Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New → Project**
2. Import your GitHub repo
3. Set **Root Directory** = `frontend`
4. Framework Preset = **Next.js** (auto-detected)
5. Add **Environment Variables**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://mmo-clipper-backend.onrender.com/api` |
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase |

6. Click **Deploy**

> **Note**: After deploying the backend on Render (Step 3), come back and update `NEXT_PUBLIC_API_URL` with the actual backend URL.

---

## Step 3: Deploy Backend + AI Service on Render

1. Go to [render.com](https://render.com) → **New → Blueprint**
2. Select your GitHub repo
3. Render auto-detects `render.yaml` and creates 2 services:
   - `mmo-clipper-backend` (Docker/Express)
   - `mmo-clipper-ai` (Docker/Whisper)

4. Set environment variables on each service → **Environment** tab:

### Backend (`mmo-clipper-backend`)
| Variable | Value |
|---|---|
| `SUPABASE_URL` | from Supabase |
| `SUPABASE_SERVICE_KEY` | from Supabase |
| `FRONTEND_URL` | your Vercel URL (e.g. `https://mmo-clipper.vercel.app`) |
| `AI_SERVICE_URL` | auto-set via `fromService`, or manually: `https://mmo-clipper-ai.onrender.com` |

### AI Service (`mmo-clipper-ai`)
| Variable | Value |
|---|---|
| `WHISPER_MODEL` | `base` (or `tiny` for free tier) |

---

## Step 4: Verify Deployment

```bash
# Backend health
curl https://mmo-clipper-backend.onrender.com/health

# AI service health
curl https://mmo-clipper-ai.onrender.com/health

# AI service status
curl https://mmo-clipper-ai.onrender.com/status
```

Then visit your Vercel frontend URL and test the full flow.

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| CORS errors on Vercel | `FRONTEND_URL` not set on backend | Set to your Vercel URL |
| AI service OOM | Whisper model too large | Change `WHISPER_MODEL` to `tiny` |
| 503 from AI service | Already processing a job | Normal — backend retries automatically |
| Files lost after redeploy | Render ephemeral disk | Expected on free tier |
| Cold start ~30s | Render free tier sleep | Upgrade to paid ($7/mo) |
| Upload fails | File > 500MB or timeout | Check file size and Render logs |

---

## Local Development

```bash
# Terminal 1: Backend
cd backend
cp .env.example .env    # fill in real values
npm install
npm run dev

# Terminal 2: AI Service
cd ai-service
pip install -r requirements.txt
python app.py

# Terminal 3: Frontend
cd frontend
npm install
npm run dev
```
