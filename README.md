# MMO Video Clipper - MVP

An AI-powered web tool that transforms long videos into viral short clips with automatic transcription and subtitles.

## 🎯 Project Overview

This tool helps content creators:
- Extract multiple short clips from long videos
- Generate AI-powered transcriptions using Whisper
- Create multi-language subtitles
- Edit subtitles before final export

**Target Users:** TikTok/YouTube Shorts/Reels creators, MMO marketers, content repurposers

## 🏗️ Architecture

The project consists of three main services:

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Frontend  │─────▶│   Backend   │─────▶│ AI Service  │
│  (Next.js)  │      │  (Node.js)  │      │  (Python)   │
└─────────────┘      └─────────────┘      └─────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │   Storage   │
                     │ (Local/S3)  │
                     └─────────────┘
```

- **Frontend**: Next.js with TypeScript and Tailwind CSS
- **Backend**: Node.js/Express API with job queue
- **AI Service**: Python Flask with Whisper and FFmpeg
- **Storage**: Local filesystem (S3-compatible for production)

## 📁 Project Structure

```
mmo-video-clipper/
├── frontend/          # Next.js application
├── backend/           # Node.js API server
└── ai-service/        # Python AI microservice
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.8+
- FFmpeg installed on your system

### 1. Backend Setup

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:3001`

### 2. AI Service Setup

```bash
cd ai-service
pip install -r requirements.txt
python app.py
```

AI Service runs on `http://localhost:5000`

**Note:** First run will download the Whisper model (~150MB for base model)

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

## 📋 Phase 1 - Current Features

✅ **Completed:**
- Video upload with validation
- Audio extraction from video using FFmpeg
- AI-powered transcription with Whisper
- Transcript JSON output with timestamps
- Job queue and status tracking
- Real-time progress updates

## 🗺️ Development Roadmap

### Phase 1: Setup + Upload + Transcription ✅
- [x] Project architecture
- [x] Video upload
- [x] Audio extraction
- [x] Whisper transcription

### Phase 2: Clip Detection + Cutting (Next)
- [ ] Smart segmentation algorithm
- [ ] Clip detection logic
- [ ] FFmpeg video cutting
- [ ] Clip metadata generation

### Phase 3: Subtitle Generation
- [ ] SRT/VTT generation
- [ ] Translation API integration
- [ ] Subtitle burning with FFmpeg
- [ ] Styling options

### Phase 4: Subtitle Editor UI
- [ ] Video preview component
- [ ] Timeline editor
- [ ] Text editing
- [ ] Timing adjustment

### Phase 5: Optimization + Deployment
- [ ] Job queue optimization
- [ ] Performance tuning
- [ ] Deployment configuration
- [ ] Production readiness

## 🧪 Testing Phase 1

1. Start all three services (backend, AI service, frontend)
2. Open `http://localhost:3000` in your browser
3. Upload a test video (MP4 recommended, max 500MB)
4. Watch the job status update in real-time
5. When complete, check the storage folders for:
   - `backend/storage/videos/` - Original video
   - `backend/storage/audio/` - Extracted audio
   - `backend/storage/transcripts/` - JSON transcript

## 📝 API Documentation

### Backend API

**Upload Video**
```
POST /api/upload
Content-Type: multipart/form-data
Body: video (file)
```

**Get Job Status**
```
GET /api/jobs/:jobId
```

### AI Service API

**Transcribe Video**
```
POST /transcribe
Content-Type: application/json
Body: { "jobId": "uuid", "videoPath": "/path/to/video.mp4" }
```

## 🔧 Configuration

### Backend (`backend/src/config/index.ts`)
- `PORT`: API server port (default: 3001)
- `AI_SERVICE_URL`: AI service URL (default: http://localhost:5000)
- `maxFileSize`: Max upload size (default: 500MB)

### AI Service (`ai-service/config.py`)
- `PORT`: Service port (default: 5000)
- `WHISPER_MODEL`: Model size (tiny/base/small/medium/large)
- `STORAGE_DIR`: Storage directory path

### Frontend
Create `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## 💡 Design Decisions

**Why separate AI service?**
- Python ecosystem for Whisper
- Isolates heavy processing
- Can scale independently

**Why in-memory job queue?**
- MVP simplicity
- Easy to replace with Redis later
- No additional infrastructure

**Why local storage?**
- Faster development
- Easy migration to S3
- No cloud costs during development

## 📦 Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript, Multer
- **AI**: Python, Flask, OpenAI Whisper, FFmpeg
- **Storage**: Local filesystem (S3-ready)

## 🎓 Next Steps

After Phase 1 approval:
1. Test the complete flow with sample videos
2. Verify transcript accuracy
3. Move to Phase 2: Clip Detection

## 📄 License

MIT

---

**Status**: Phase 1 Complete - Awaiting Testing & Approval
