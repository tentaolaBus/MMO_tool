from flask import Flask, request, jsonify
import os
import threading
import time
from config import config
from services.audio_extractor import AudioExtractor
from services.transcriber import Transcriber

app = Flask(__name__)

# Initialize services — Whisper model is loaded ONCE here
audio_extractor = AudioExtractor()
transcriber = Transcriber(model_name=config.WHISPER_MODEL)

# ── Concurrency guard ────────────────────────────────────────
# Whisper is NOT thread-safe — only one transcription at a time.
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


@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Transcribe video endpoint.

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

    if not data or 'jobId' not in data or 'videoPath' not in data:
        return jsonify({
            'success': False,
            'error': 'Missing required fields: jobId, videoPath'
        }), 400

    job_id = data['jobId']
    video_path = data['videoPath']

    # Validate video file exists
    if not os.path.exists(video_path):
        return jsonify({
            'success': False,
            'error': f'Video file not found: {video_path}'
        }), 404

    # Try to acquire the lock — don't block if another job is running
    acquired = _processing_lock.acquire(blocking=False)
    if not acquired:
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

        print(f"\n🔄 Processing job {job_id}")
        print(f"   Video: {video_path}")
        start_time = time.time()

        # Step 1: Extract audio
        print("   [1/2] Extracting audio...")
        audio_ok = audio_extractor.extract_audio(video_path, audio_path)
        if not audio_ok:
            _jobs_failed += 1
            return jsonify({
                'success': False,
                'error': 'Failed to extract audio from video'
            }), 500

        # Step 2: Transcribe audio
        print("   [2/2] Transcribing...")
        transcript_data = transcriber.transcribe(audio_path, transcript_path, job_id)

        elapsed = time.time() - start_time
        _jobs_completed += 1
        print(f"   ✅ Job {job_id} completed in {elapsed:.1f}s\n")

        return jsonify({
            'success': True,
            'audioPath': audio_path,
            'transcriptPath': transcript_path,
            'language': transcript_data['language'],
            'duration': transcript_data['duration'],
            'segmentCount': len(transcript_data['segments'])
        })

    except Exception as e:
        _jobs_failed += 1
        print(f"   ❌ Job {job_id} failed: {str(e)}\n")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

    finally:
        _current_job_id = None
        _processing_lock.release()


if __name__ == '__main__':
    print(f"Starting AI Service on port {config.PORT}")
    print(f"Whisper model: {config.WHISPER_MODEL}")
    print(f"Storage directory: {config.STORAGE_DIR}")
    app.run(host='0.0.0.0', port=config.PORT, debug=False)
