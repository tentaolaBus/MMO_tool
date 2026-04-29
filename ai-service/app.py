from flask import Flask, request, jsonify
import os
import threading
import time
import json
from datetime import datetime
from config import config
from services.audio_extractor import AudioExtractor
from services.transcriber import Transcriber

app = Flask(__name__)

# Initialize legacy services — Whisper model is loaded ONCE here
audio_extractor = AudioExtractor()
transcriber = Transcriber(model_name=config.WHISPER_MODEL)

# ── Concurrency guard ────────────────────────────────────────
# Only one heavy job at a time (GPU constraint).
_processing_lock = threading.Lock()
_current_job_id: str | None = None
_jobs_completed = 0
_jobs_failed = 0


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'whisper_model': config.WHISPER_MODEL,
        'busy': _processing_lock.locked(),
        'current_job': _current_job_id,
        'stats': {
            'completed': _jobs_completed,
            'failed': _jobs_failed,
        }
    })


@app.route('/status', methods=['GET'])
def status():
    """Detailed status endpoint for monitoring"""
    return jsonify({
        'service': 'mmo-ai-service',
        'model': config.WHISPER_MODEL,
        'busy': _processing_lock.locked(),
        'current_job': _current_job_id,
        'completed': _jobs_completed,
        'failed': _jobs_failed,
    })


# ═══════════════════════════════════════════════════════════════
# LEGACY: Basic transcribe endpoint (backward compatible)
# ═══════════════════════════════════════════════════════════════

@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Transcribe video endpoint (legacy).

    Request JSON:
    {
        "jobId": "uuid",
        "videoPath": "/path/to/video.mp4"
    }

    Response JSON:
    {
        "success": true,
        "audioPath": "/path/to/audio.mp3",
        "transcriptPath": "/path/to/transcript.json"
    }
    """
    global _current_job_id, _jobs_completed, _jobs_failed

    data = request.get_json()
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"\n📝 [{ts}] === TRANSCRIBE REQUEST ===")

    if not data or 'jobId' not in data or 'videoPath' not in data:
        print(f"   ❌ Missing required fields in request body")
        return jsonify({
            'success': False,
            'error': 'Missing required fields: jobId, videoPath'
        }), 400

    job_id = data['jobId']
    video_path = data['videoPath']
    print(f"   [PIPELINE] Job ID: {job_id}")
    print(f"   [PIPELINE] Video: {video_path}")

    # Validate video file exists
    if not os.path.exists(video_path):
        print(f"   [PIPELINE] ❌ Video file NOT FOUND: {video_path}")
        return jsonify({
            'success': False,
            'error': f'Video file not found: {video_path}'
        }), 404

    # Validate file format
    valid_extensions = ('.mp4', '.mpeg', '.mov', '.avi', '.wav', '.mp3', '.mkv')
    if not video_path.lower().endswith(valid_extensions):
        print(f"   [PIPELINE] ❌ Unsupported file format: {video_path}")
        return jsonify({
            'success': False,
            'error': f'Unsupported file format. Accepted: {valid_extensions}'
        }), 400

    file_size_mb = os.path.getsize(video_path) / (1024 * 1024)
    print(f"   [PIPELINE] File size: {file_size_mb:.2f} MB")

    # Try to acquire the lock — don't block if another job is running
    acquired = _processing_lock.acquire(blocking=False)
    if not acquired:
        print(f"   [PIPELINE] ⚠️ BUSY — already processing job: {_current_job_id}")
        return jsonify({
            'success': False,
            'error': f'AI service is busy processing job: {_current_job_id}. Try again later.',
            'retry': True,
        }), 503

    try:
        _current_job_id = job_id

        # Derive storage paths
        storage_base = os.path.dirname(os.path.dirname(os.path.abspath(video_path)))
        audio_path = os.path.join(storage_base, 'audio', f'{job_id}.mp3')
        transcript_path = os.path.join(storage_base, 'transcripts', f'{job_id}.json')

        print(f"   [PIPELINE] Audio output: {audio_path}")
        print(f"   [PIPELINE] Transcript output: {transcript_path}")
        start_time = time.time()

        # Step 1: Extract audio
        print(f"   [PIPELINE] [1/2] Extracting audio...")
        audio_ok = audio_extractor.extract_audio(video_path, audio_path)
        if not audio_ok:
            _jobs_failed += 1
            elapsed = time.time() - start_time
            print(f"   [PIPELINE] ❌ Audio extraction FAILED after {elapsed:.1f}s")
            return jsonify({
                'success': False,
                'error': 'Failed to extract audio from video. Check FFmpeg installation.'
            }), 500

        audio_elapsed = time.time() - start_time
        print(f"   [PIPELINE] ✅ Audio extracted in {audio_elapsed:.1f}s")

        # Step 2: Transcribe audio
        print(f"   [PIPELINE] [2/2] Transcribing with Whisper ({config.WHISPER_MODEL})...")
        transcript_data = transcriber.transcribe(audio_path, transcript_path, job_id)

        elapsed = time.time() - start_time
        _jobs_completed += 1
        seg_count = len(transcript_data.get('segments', []))
        lang = transcript_data.get('language', 'unknown')
        print(f"   [PIPELINE] ✅ Transcription complete: {seg_count} segments, lang={lang}")
        print(f"   [PIPELINE] Job {job_id} DONE in {elapsed:.1f}s\n")

        return jsonify({
            'success': True,
            'audioPath': audio_path,
            'transcriptPath': transcript_path,
            'language': transcript_data['language'],
            'duration': transcript_data['duration'],
            'segmentCount': seg_count
        })

    except Exception as e:
        _jobs_failed += 1
        elapsed = time.time() - start_time
        print(f"   [PIPELINE] ❌ Job {job_id} FAILED after {elapsed:.1f}s: {str(e)}\n")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

    finally:
        _current_job_id = None
        _processing_lock.release()


# ═══════════════════════════════════════════════════════════════
# NEW: Multimodal Highlight Analysis endpoint
# ═══════════════════════════════════════════════════════════════

@app.route('/analyze-highlights', methods=['POST'])
def analyze_highlights():
    """
    Full multimodal highlight extraction pipeline.

    Runs all 6 phases: preprocessing, audio analysis, text analysis,
    visual analysis, scoring, and clip selection.

    Request JSON:
    {
        "jobId": "uuid",
        "videoPath": "/path/to/video.mp4",
        "category": "podcast" | "sports" | "movie",  // optional, default "podcast"
        "maxClips": 10,                               // optional
        "whisperModel": "medium"                      // optional, default from config
    }

    Response JSON:
    {
        "success": true,
        "highlights": [
            {
                "start": 45.2,
                "end": 82.7,
                "duration": 37.5,
                "score": 87.3,
                "viral_score": 96.0,
                "confidence": 0.92,
                "breakdown": { ... },
                "keywords": ["money", "mindset"],
                "text": "transcript text..."
            },
            ...
        ],
        "metadata": {
            "video_duration": 300.5,
            "language": "en",
            "category": "podcast",
            "total_segments_analyzed": 20,
            "processing_time_seconds": 45.2
        }
    }
    """
    global _current_job_id, _jobs_completed, _jobs_failed

    data = request.get_json()

    if not data or 'jobId' not in data or 'videoPath' not in data:
        return jsonify({
            'success': False,
            'error': 'Missing required fields: jobId, videoPath'
        }), 400

    job_id = data['jobId']
    video_path = data['videoPath']
    category = data.get('category', 'podcast')
    max_clips = data.get('maxClips', 10)
    whisper_model = data.get('whisperModel', config.WHISPER_MODEL)

    # Validate category
    valid_categories = ['podcast', 'sports', 'movie']
    if category not in valid_categories:
        return jsonify({
            'success': False,
            'error': f'Invalid category: {category}. Must be one of: {valid_categories}'
        }), 400

    # Validate video file exists
    if not os.path.exists(video_path):
        return jsonify({
            'success': False,
            'error': f'Video file not found: {video_path}'
        }), 404

    # Try to acquire the lock
    acquired = _processing_lock.acquire(blocking=False)
    if not acquired:
        return jsonify({
            'success': False,
            'error': f'AI service is busy processing job: {_current_job_id}. Try again later.',
            'retry': True,
        }), 503

    try:
        _current_job_id = job_id

        print(f"\n🧠 ====== HIGHLIGHT ANALYSIS: {job_id} ======")
        print(f"   Video: {video_path}")
        print(f"   Category: {category}")
        print(f"   Whisper model: {whisper_model}")

        # Derive storage directory
        storage_base = os.path.dirname(os.path.dirname(os.path.abspath(video_path)))
        analysis_dir = os.path.join(storage_base, 'analysis', job_id)

        # Import and configure pipeline
        from services.highlight_pipeline import HighlightPipeline, PipelineConfig

        pipeline_config = PipelineConfig(
            whisper_model=whisper_model,
            max_clips=max_clips,
        )

        pipeline = HighlightPipeline(config=pipeline_config)

        # Run the full pipeline
        result = pipeline.process(
            video_path=video_path,
            category=category,
            job_id=job_id,
            storage_dir=analysis_dir,
        )

        _jobs_completed += 1

        # Also save transcript for backward compatibility
        transcript_path = os.path.join(storage_base, 'transcripts', f'{job_id}.json')
        audio_path = os.path.join(storage_base, 'audio', f'{job_id}.mp3')
        os.makedirs(os.path.dirname(transcript_path), exist_ok=True)
        os.makedirs(os.path.dirname(audio_path), exist_ok=True)

        # Build a legacy-compatible transcript from the pipeline result
        # The pipeline had a Whisper transcript internally — reconstruct it
        legacy_transcript = {
            'jobId': job_id,
            'language': result.get('language', 'en'),
            'duration': result.get('video_duration', 0),
            'segments': []
        }

        # Create segments from the highlight clips for backward compat
        for idx, clip in enumerate(result.get('clips', [])):
            legacy_transcript['segments'].append({
                'id': idx,
                'start': clip.get('start', 0),
                'end': clip.get('end', 0),
                'text': clip.get('text', ''),
            })

        # Save the transcript file
        with open(transcript_path, 'w', encoding='utf-8') as f:
            json.dump(legacy_transcript, f, indent=2, ensure_ascii=False)
        print(f"   💾 Saved legacy transcript: {transcript_path}")

        # Extract audio to standard location if not already there
        if not os.path.exists(audio_path):
            try:
                import subprocess
                subprocess.run([
                    'ffmpeg', '-y', '-i', video_path,
                    '-vn', '-ar', '16000', '-ac', '1', audio_path
                ], capture_output=True, timeout=300)
                print(f"   💾 Saved audio: {audio_path}")
            except Exception as audio_err:
                print(f"   ⚠️ Audio extraction skipped: {audio_err}")

        # Save highlights
        transcript_file = os.path.join(analysis_dir, 'highlights.json')

        return jsonify({
            'success': True,
            'highlights': result['clips'],
            'total': len(result['clips']),
            'metadata': {
                'video_duration': result['video_duration'],
                'language': result['language'],
                'category': result['category'],
                'total_segments_analyzed': result['total_segments_analyzed'],
                'processing_time_seconds': result['processing_time_seconds'],
            },
            'analysisPath': transcript_file,
            'transcriptPath': transcript_path,
            'audioPath': audio_path,
        })

    except Exception as e:
        _jobs_failed += 1
        import traceback
        traceback.print_exc()
        print(f"   ❌ Highlight analysis {job_id} failed: {str(e)}\n")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

    finally:
        _current_job_id = None
        _processing_lock.release()


# ═══════════════════════════════════════════════════════════════
# Server startup
# ═══════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print(f"Starting AI Service on port {config.PORT}")
    print(f"Whisper model: {config.WHISPER_MODEL}")
    print(f"Storage directory: {config.STORAGE_DIR}")
    print(f"Endpoints:")
    print(f"  POST /transcribe          — Legacy transcription")
    print(f"  POST /analyze-highlights  — Multimodal highlight extraction")
    print(f"  GET  /health              — Health check")
    print(f"  GET  /status              — Detailed status")
    app.run(host='0.0.0.0', port=config.PORT, debug=False)
