import whisper
import json
import os
from typing import Dict, Any

class Transcriber:
    """
    Transcribes audio files using OpenAI Whisper
    """
    
    def __init__(self, model_name: str = 'base'):
        """
        Initialize Whisper model
        
        Args:
            model_name: Whisper model size (tiny, base, small, medium, large)
        """
        print(f"Loading Whisper model: {model_name}")
        self.model = whisper.load_model(model_name)
        print("Whisper model loaded successfully")
    
    def transcribe(self, audio_path: str, transcript_path: str, job_id: str) -> Dict[str, Any]:
        """
        Transcribe audio file and save as JSON
        
        Args:
            audio_path: Path to audio file
            transcript_path: Path to save transcript JSON
            job_id: Job ID for reference
            
        Returns:
            Dictionary with transcription results
        """
        try:
            print(f"Transcribing audio: {audio_path}")
            
            # Transcribe using Whisper
            # verbose=None disables tqdm progress bar, which crashes on Windows
            # under Flask's debug reloader (broken sys.stderr pipe handle).
            result = self.model.transcribe(
                audio_path,
                verbose=None,
                language=None,  # Auto-detect language
            )
            
            # Format transcript data
            transcript_data = {
                'jobId': job_id,
                'language': result.get('language', 'unknown'),
                'duration': result.get('duration', 0),
                'segments': [
                    {
                        'id': seg['id'],
                        'start': seg['start'],
                        'end': seg['end'],
                        'text': seg['text'].strip()
                    }
                    for seg in result.get('segments', [])
                ]
            }
            
            # Ensure output directory exists
            os.makedirs(os.path.dirname(transcript_path), exist_ok=True)
            
            # Save transcript as JSON
            with open(transcript_path, 'w', encoding='utf-8') as f:
                json.dump(transcript_data, f, indent=2, ensure_ascii=False)
            
            print(f"Transcript saved: {transcript_path}")
            print(f"Language detected: {transcript_data['language']}")
            print(f"Duration: {transcript_data['duration']:.2f}s")
            print(f"Segments: {len(transcript_data['segments'])}")
            
            return transcript_data
            
        except Exception as e:
            print(f"Error transcribing audio: {str(e)}")
            raise
