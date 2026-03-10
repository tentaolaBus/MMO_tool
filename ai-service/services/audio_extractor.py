import os
import subprocess
import time


class AudioExtractor:
    """
    Extracts audio from video files using FFmpeg (via subprocess).
    Uses subprocess instead of ffmpeg-python for better timeout control.
    """

    # 10 minute timeout for audio extraction (handles long videos)
    EXTRACTION_TIMEOUT = 600

    def extract_audio(self, video_path: str, audio_path: str) -> bool:
        """
        Extract audio from video file and save as MP3.

        Uses FFmpeg with settings optimised for Whisper:
        - 16kHz sample rate (Whisper's native rate)
        - mono channel
        - 128kbps bitrate

        Returns True if successful, False otherwise.
        """
        try:
            # Ensure output directory exists
            os.makedirs(os.path.dirname(audio_path), exist_ok=True)

            start = time.time()

            cmd = [
                'ffmpeg', '-y',
                '-i', video_path,
                '-vn',                  # no video
                '-acodec', 'libmp3lame',
                '-ar', '16000',         # 16kHz for Whisper
                '-ac', '1',             # mono
                '-ab', '128k',
                audio_path,
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.EXTRACTION_TIMEOUT,
            )

            elapsed = time.time() - start

            if result.returncode != 0:
                print(f"FFmpeg error (exit {result.returncode}): {result.stderr[-500:]}")
                return False

            size_kb = os.path.getsize(audio_path) / 1024
            print(f"Audio extracted: {audio_path} ({size_kb:.0f} KB, {elapsed:.1f}s)")
            return True

        except subprocess.TimeoutExpired:
            print(f"FFmpeg timed out after {self.EXTRACTION_TIMEOUT}s for: {video_path}")
            return False
        except Exception as e:
            print(f"Error extracting audio: {str(e)}")
            return False
