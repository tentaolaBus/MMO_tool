# Quick Start Guide

## Prerequisites

### 1. Install FFmpeg (Required!)
- Download from: https://ffmpeg.org/download.html
- Extract and add to Windows PATH
- Verify: Open PowerShell and type `ffmpeg -version`

### 2. Install Node.js (if not already installed)
- Download from: https://nodejs.org/
- Version 18 or higher

### 3. Install Python (if not already installed)
- Download from: https://python.org/
- Version 3.8 or higher

## Running the Application

You need **3 terminal windows** running simultaneously:

### Terminal 1: Backend (Node.js API)
```powershell
cd C:\Users\Admin\.gemini\antigravity\scratch\MMO_tool\backend
npm install
npm run dev
```
✅ Should see: "Backend server running on port 3001"

### Terminal 2: AI Service (Python)
```powershell
cd C:\Users\Admin\.gemini\antigravity\scratch\MMO_tool\ai-service
pip install -r requirements.txt
python app.py
```
✅ Should see: "Starting AI Service on port 5000"
⏳ First run downloads Whisper model (~150MB, takes 2-3 minutes)

### Terminal 3: Frontend (Next.js)
```powershell
cd C:\Users\Admin\.gemini\antigravity\scratch\MMO_tool\frontend
npm install
npm run dev
```
✅ Should see: "Ready on http://localhost:3000"

## Access the Application

Open your browser and go to:
**http://localhost:3000**

## Testing

1. Upload a test video (MP4 recommended)
2. Watch the status change from PENDING → PROCESSING → COMPLETED
3. Check results in `backend/storage/` folders

## Troubleshooting

**"FFmpeg not found"**
- Make sure FFmpeg is installed and in PATH
- Restart terminals after installing

**"Port already in use"**
- Close other applications using ports 3000, 3001, or 5000
- Or change ports in config files

**"Module not found"**
- Run `npm install` in backend and frontend
- Run `pip install -r requirements.txt` in ai-service
