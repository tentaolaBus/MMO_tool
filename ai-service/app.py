from flask import Flask, request, jsonify
import os, json, time
from config import config
from services.audio_extractor import AudioExtractor
from services.transcriber import Transcriber

# #region agent log
def _dbglog(loc, msg, data=None, hyp=''):
    try:
        with open(os.path.join(os.path.dirname(__file__), '..', 'debug-0170bb.log'), 'a') as f:
            f.write(json.dumps({'sessionId':'0170bb','location':loc,'message':msg,'data':data or {},'timestamp':int(time.time()*1000),'hypothesisId':hyp}) + '\n')
    except: pass
# #endregion

app = Flask(__name__)

# Initialize services
audio_extractor = AudioExtractor()
transcriber = Transcriber(model_name=config.WHISPER_MODEL)

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'whisper_model': config.WHISPER_MODEL
    })

@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Transcribe video endpoint
    
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
    try:
        data = request.get_json()
        
        if not data or 'jobId' not in data or 'videoPath' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: jobId, videoPath'
            }), 400
        
        job_id = data['jobId']
        video_path = data['videoPath']
        
        # #region agent log
        _dbglog('app.py:transcribe', 'Transcribe request received', {'jobId': job_id, 'videoPath': video_path, 'exists': os.path.exists(video_path)}, 'H4')
        # #endregion
        
        # Validate video file exists
        if not os.path.exists(video_path):
            # #region agent log
            _dbglog('app.py:transcribe', 'Video NOT found', {'videoPath': video_path}, 'H4')
            # #endregion
            return jsonify({
                'success': False,
                'error': f'Video file not found: {video_path}'
            }), 404
        
        # Generate output paths
        audio_path = os.path.join(config.STORAGE_DIR, 'audio', f'{job_id}.mp3')
        transcript_path = os.path.join(config.STORAGE_DIR, 'transcripts', f'{job_id}.json')
        
        print(f"Processing job {job_id}")
        print(f"Video: {video_path}")
        print(f"Audio: {audio_path}")
        print(f"Transcript: {transcript_path}")
        
        # Step 1: Extract audio
        print("Step 1: Extracting audio...")
        audio_ok = audio_extractor.extract_audio(video_path, audio_path)
        # #region agent log
        _dbglog('app.py:transcribe', 'Audio extraction result', {'success': audio_ok, 'audioPath': audio_path, 'audioExists': os.path.exists(audio_path) if audio_ok else False}, 'H3')
        # #endregion
        if not audio_ok:
            return jsonify({
                'success': False,
                'error': 'Failed to extract audio from video'
            }), 500
        
        # Step 2: Transcribe audio
        print("Step 2: Transcribing audio...")
        # #region agent log
        _dbglog('app.py:transcribe', 'Starting Whisper transcription', {'audioPath': audio_path}, 'H2')
        # #endregion
        transcript_data = transcriber.transcribe(audio_path, transcript_path, job_id)
        
        print(f"Job {job_id} completed successfully")
        
        return jsonify({
            'success': True,
            'audioPath': audio_path,
            'transcriptPath': transcript_path,
            'language': transcript_data['language'],
            'duration': transcript_data['duration'],
            'segmentCount': len(transcript_data['segments'])
        })
        
    except Exception as e:
        # #region agent log
        import traceback
        _dbglog('app.py:transcribe', 'EXCEPTION in transcription', {'error': str(e), 'traceback': traceback.format_exc()}, 'H2,H3')
        # #endregion
        print(f"Error processing transcription: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print(f"Starting AI Service on port {config.PORT}")
    print(f"Whisper model: {config.WHISPER_MODEL}")
    print(f"Storage directory: {config.STORAGE_DIR}")
    app.run(host='0.0.0.0', port=config.PORT, debug=True)
