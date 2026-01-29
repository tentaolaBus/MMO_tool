from flask import Flask, request, jsonify
import os
from config import config
from services.audio_extractor import AudioExtractor
from services.transcriber import Transcriber

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
        
        # Validate video file exists
        if not os.path.exists(video_path):
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
        if not audio_extractor.extract_audio(video_path, audio_path):
            return jsonify({
                'success': False,
                'error': 'Failed to extract audio from video'
            }), 500
        
        # Step 2: Transcribe audio
        print("Step 2: Transcribing audio...")
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
