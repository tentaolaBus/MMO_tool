# AI Service - Python Flask

## Setup

### Install FFmpeg
Make sure FFmpeg is installed on your system:
- Windows: Download from https://ffmpeg.org/download.html
- Mac: `brew install ffmpeg`
- Linux: `sudo apt-get install ffmpeg`

### Install Python Dependencies
```bash
pip install -r requirements.txt
```

Note: First time running will download the Whisper model (~150MB for base model)

## Development

```bash
python app.py
```

Server will run on http://localhost:3000

## API Endpoints

### Transcribe Video
```
POST /transcribe
Content-Type: application/json

{
  "jobId": "uuid",
  "videoPath": "/path/to/video.mp4"
}
```

## Whisper Models

Available models (set via WHISPER_MODEL env var):
- `tiny` - Fastest, least accurate (~75MB)
- `base` - Good balance (default, ~150MB)
- `small` - Better accuracy (~500MB)
- `medium` - High accuracy (~1.5GB)
- `large` - Best accuracy (~3GB)

For MVP, use `base` model.
