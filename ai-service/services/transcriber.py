import whisper
import json
import os
import time
from typing import Dict, Any


class Transcriber:
    """
    Transcribes audio files using OpenAI Whisper.
    Model is loaded ONCE in __init__ and reused for all requests.
    """

    def __init__(self, model_name: str = 'base'):
        print(f"Loading Whisper model: {model_name}")
        self.model = whisper.load_model(model_name)
        self.model_name = model_name
        print("Whisper model loaded successfully")

    def transcribe(self, audio_path: str, transcript_path: str, job_id: str) -> Dict[str, Any]:
        """
        Transcribe audio file and save as JSON.

        Uses fp16=False for CPU-only environments (Render has no GPU).
        """
        try:
            print(f"Transcribing audio: {audio_path}")
            start = time.time()

            # fp16=False is required on CPU (no CUDA). Without it, Whisper
            # will warn and fallback anyway, but this makes it explicit.
            result = self.model.transcribe(
                audio_path,
                verbose=None,           # disable tqdm (crashes on Windows)
                language=None,          # auto-detect language
                fp16=False,             # CPU mode — Render has no GPU
            )

            elapsed = time.time() - start

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

            seg_count = len(transcript_data['segments'])
            duration = transcript_data['duration']
            print(f"Transcription complete: {elapsed:.1f}s for {duration:.0f}s audio, {seg_count} segments")
            print(f"Language: {transcript_data['language']}")
            print(f"Transcript saved: {transcript_path}")

            return transcript_data

        except Exception as e:
            print(f"Error transcribing audio: {str(e)}")
            raise
