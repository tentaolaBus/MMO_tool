import os
import ffmpeg

class AudioExtractor:
    """
    Extracts audio from video files using FFmpeg
    """
    
    def extract_audio(self, video_path: str, audio_path: str) -> bool:
        """
        Extract audio from video file and save as MP3
        
        Args:
            video_path: Path to input video file
            audio_path: Path to output audio file
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Ensure output directory exists
            os.makedirs(os.path.dirname(audio_path), exist_ok=True)
            
            # Extract audio using FFmpeg
            # -vn: no video
            # -acodec libmp3lame: use MP3 codec
            # -ar 16000: sample rate 16kHz (optimal for Whisper)
            # -ac 1: mono audio
            # -ab 128k: bitrate 128kbps
            (
                ffmpeg
                .input(video_path)
                .output(
                    audio_path,
                    acodec='libmp3lame',
                    ar='16000',
                    ac=1,
                    ab='128k',
                    **{'vn': None}
                )
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )
            
            print(f"Audio extracted successfully: {audio_path}")
            return True
            
        except ffmpeg.Error as e:
            print(f"FFmpeg error: {e.stderr.decode()}")
            return False
        except Exception as e:
            print(f"Error extracting audio: {str(e)}")
            return False
