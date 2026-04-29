"""
Audio Feature Extraction Module
================================
Extracts multimodal audio features from video audio tracks:
  - Speech transcription (faster-whisper with word timestamps)
  - Loudness / RMS energy profile (librosa)
  - Speech emotion recognition (wav2vec2)
  - Audio event detection (laughter, applause, crowd noise)
"""

import os
import time
import numpy as np
from typing import Dict, List, Any, Optional


class AudioAnalyzer:
    """
    Orchestrates all audio-level feature extraction.

    Uses a sequential loading strategy to fit within GPU VRAM limits:
      1. Load Whisper → transcribe → keep loaded for emotion model
      2. Load emotion model → classify → unload all
    """

    def __init__(self):
        self.whisper_model = None
        self.emotion_pipeline = None
        self._models_loaded = False

    # ── Model Lifecycle ──────────────────────────────────────

    def load_models(self, whisper_size: str = "medium",
                    device: str = "auto"):
        """
        Load audio analysis models.

        Args:
            whisper_size: Whisper model size (tiny/base/small/medium/large-v3)
            device: "cuda", "cpu", or "auto"
        """
        if self._models_loaded:
            return

        import torch
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"

        compute_type = "float16" if device == "cuda" else "int8"

        print(f"🔊 Loading Whisper ({whisper_size}) on {device}...")
        start = time.time()

        from faster_whisper import WhisperModel
        self.whisper_model = WhisperModel(
            whisper_size,
            device=device,
            compute_type=compute_type,
        )
        print(f"   Whisper loaded in {time.time() - start:.1f}s")

        # Emotion model — lightweight, can coexist with Whisper
        try:
            print("🔊 Loading speech emotion model...")
            from transformers import pipeline as hf_pipeline
            emotion_device = 0 if device == "cuda" else -1
            self.emotion_pipeline = hf_pipeline(
                "audio-classification",
                model="superb/wav2vec2-base-superb-er",
                device=emotion_device,
            )
            print("   Emotion model loaded")
        except Exception as e:
            print(f"   ⚠️ Emotion model failed to load: {e}")
            self.emotion_pipeline = None

        self._models_loaded = True

    def unload_models(self):
        """Free GPU memory so visual models can load."""
        if not self._models_loaded:
            return

        del self.whisper_model
        del self.emotion_pipeline
        self.whisper_model = None
        self.emotion_pipeline = None
        self._models_loaded = False

        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass

        print("🔊 Audio models unloaded, GPU memory freed")

    # ── Transcription ────────────────────────────────────────

    def transcribe(self, audio_path: str) -> Dict[str, Any]:
        """
        Transcribe audio with word-level timestamps using faster-whisper.

        Returns:
            {
                "language": "en",
                "duration": 300.5,
                "segments": [
                    {
                        "id": 0,
                        "start": 0.0,
                        "end": 3.2,
                        "text": "Hello world",
                        "words": [{"word": "Hello", "start": 0.0, "end": 0.5}, ...]
                    },
                    ...
                ]
            }
        """
        if self.whisper_model is None:
            raise RuntimeError("Models not loaded. Call load_models() first.")

        print(f"   Transcribing: {audio_path}")
        start = time.time()

        segments_iter, info = self.whisper_model.transcribe(
            audio_path,
            word_timestamps=True,
            vad_filter=True,       # Skip silence for speed
            vad_parameters=dict(
                min_silence_duration_ms=500,
            ),
        )

        # Materialize the generator
        segments = []
        for i, seg in enumerate(segments_iter):
            words = []
            if seg.words:
                for w in seg.words:
                    words.append({
                        "word": w.word,
                        "start": round(w.start, 3),
                        "end": round(w.end, 3),
                        "probability": round(w.probability, 3),
                    })

            segments.append({
                "id": i,
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
                "words": words,
            })

        elapsed = time.time() - start
        duration = info.duration
        print(f"   Transcribed {duration:.0f}s audio in {elapsed:.1f}s "
              f"({len(segments)} segments, lang={info.language})")

        return {
            "language": info.language,
            "duration": duration,
            "segments": segments,
        }

    # ── Energy / Loudness ────────────────────────────────────

    def analyze_energy(self, audio_path: str,
                       segments: List[Dict]) -> List[Dict]:
        """
        Compute RMS energy per temporal segment.

        Returns per segment:
            {"mean_energy", "max_energy", "energy_std", "energy_peak_ratio"}
        """
        import librosa

        y, sr = librosa.load(audio_path, sr=16000)
        rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
        times = librosa.frames_to_time(
            np.arange(len(rms)), sr=sr, hop_length=512
        )

        global_mean = float(np.mean(rms)) if len(rms) > 0 else 1e-6
        results = []

        for seg in segments:
            mask = (times >= seg["start"]) & (times <= seg["end"])
            seg_rms = rms[mask]

            if len(seg_rms) == 0:
                results.append({
                    "mean_energy": 0.0,
                    "max_energy": 0.0,
                    "energy_std": 0.0,
                    "energy_peak_ratio": 0.0,
                })
                continue

            mean_e = float(np.mean(seg_rms))
            max_e = float(np.max(seg_rms))
            std_e = float(np.std(seg_rms))
            # How much louder is this segment vs. the video average
            peak_ratio = max_e / global_mean if global_mean > 0 else 0.0

            results.append({
                "mean_energy": round(mean_e, 6),
                "max_energy": round(max_e, 6),
                "energy_std": round(std_e, 6),
                "energy_peak_ratio": round(peak_ratio, 4),
            })

        return results

    # ── Speech Emotion ───────────────────────────────────────

    def analyze_emotion(self, audio_path: str,
                        segments: List[Dict]) -> List[Dict]:
        """
        Classify emotion per temporal segment using wav2vec2 model.

        Returns per segment:
            {"dominant_emotion", "emotion_score", "emotions": {...}}
        """
        if self.emotion_pipeline is None:
            # Return neutral fallback if model didn't load
            return [
                {
                    "dominant_emotion": "neutral",
                    "emotion_score": 0.5,
                    "emotions": {},
                }
                for _ in segments
            ]

        import librosa

        y, sr = librosa.load(audio_path, sr=16000)
        results = []

        for seg in segments:
            start_sample = int(seg["start"] * sr)
            end_sample = int(seg["end"] * sr)
            seg_audio = y[start_sample:end_sample]

            if len(seg_audio) < sr:  # Less than 1 second
                results.append({
                    "dominant_emotion": "neutral",
                    "emotion_score": 0.5,
                    "emotions": {},
                })
                continue

            try:
                # Take a representative 10s chunk from the middle
                max_samples = 10 * sr
                if len(seg_audio) > max_samples:
                    mid = len(seg_audio) // 2
                    half = max_samples // 2
                    seg_audio = seg_audio[mid - half:mid + half]

                preds = self.emotion_pipeline(
                    seg_audio,
                    sampling_rate=sr,
                    top_k=5,
                )

                emotions = {p["label"]: round(p["score"], 4) for p in preds}
                dominant = preds[0]["label"]
                dom_score = preds[0]["score"]

                results.append({
                    "dominant_emotion": dominant,
                    "emotion_score": round(dom_score, 4),
                    "emotions": emotions,
                })
            except Exception as e:
                print(f"   ⚠️ Emotion analysis failed for segment: {e}")
                results.append({
                    "dominant_emotion": "neutral",
                    "emotion_score": 0.5,
                    "emotions": {},
                })

        return results

    # ── Audio Event Detection (lightweight / heuristic) ──────

    def detect_audio_events(self, audio_path: str,
                            segments: List[Dict]) -> List[Dict]:
        """
        Detect audio events using spectral heuristics.
        A lightweight alternative to YAMNet that runs on CPU.

        Detects:
          - Laughter (high-frequency energy bursts)
          - Applause (broadband noise with specific spectral shape)
          - Music (harmonic content detection)
          - Silence (very low energy)

        Returns per segment:
            {"laughter", "applause", "crowd_noise", "music", "silence"}
            Each value is a score 0.0 - 1.0
        """
        import librosa

        y, sr = librosa.load(audio_path, sr=16000)
        results = []

        for seg in segments:
            start_sample = int(seg["start"] * sr)
            end_sample = int(seg["end"] * sr)
            seg_audio = y[start_sample:end_sample]

            if len(seg_audio) < sr // 2:
                results.append({
                    "laughter": 0.0,
                    "applause": 0.0,
                    "crowd_noise": 0.0,
                    "music": 0.0,
                    "silence": 1.0,
                })
                continue

            # RMS energy
            rms = float(np.sqrt(np.mean(seg_audio ** 2)))

            # Spectral centroid (high = bright/noisy, low = deep/quiet)
            centroid = librosa.feature.spectral_centroid(
                y=seg_audio, sr=sr
            )[0]
            mean_centroid = float(np.mean(centroid)) if len(centroid) > 0 else 0

            # Zero crossing rate (high = noisy/percussive)
            zcr = librosa.feature.zero_crossing_rate(seg_audio)[0]
            mean_zcr = float(np.mean(zcr)) if len(zcr) > 0 else 0

            # Spectral rolloff (frequency below which 85% of energy)
            rolloff = librosa.feature.spectral_rolloff(
                y=seg_audio, sr=sr
            )[0]
            mean_rolloff = float(np.mean(rolloff)) if len(rolloff) > 0 else 0

            # Spectral flatness (high = noise-like, low = tonal)
            flatness = librosa.feature.spectral_flatness(y=seg_audio)[0]
            mean_flatness = float(np.mean(flatness)) if len(flatness) > 0 else 0

            # Heuristic scoring
            # Laughter: medium-high energy + high ZCR + mid centroid
            laughter_score = min(1.0, (
                (min(rms * 20, 1.0) * 0.3) +
                (min(mean_zcr * 5, 1.0) * 0.4) +
                (min(mean_centroid / 4000, 1.0) * 0.3)
            ))

            # Applause: broadband noise (high flatness + high energy)
            applause_score = min(1.0, (
                (min(mean_flatness * 3, 1.0) * 0.5) +
                (min(rms * 15, 1.0) * 0.3) +
                (min(mean_zcr * 4, 1.0) * 0.2)
            ))

            # Crowd noise: sustained broadband (high flatness + sustained)
            crowd_score = min(1.0, (
                (min(mean_flatness * 2.5, 1.0) * 0.4) +
                (min(rms * 10, 1.0) * 0.3) +
                (min(mean_rolloff / 6000, 1.0) * 0.3)
            ))

            # Music: tonal content (low flatness = harmonic)
            music_score = min(1.0, max(0, 1.0 - mean_flatness * 5) * 0.6 +
                              min(rms * 10, 1.0) * 0.4)

            # Silence
            silence_score = max(0.0, 1.0 - rms * 50)

            results.append({
                "laughter": round(laughter_score, 4),
                "applause": round(applause_score, 4),
                "crowd_noise": round(crowd_score, 4),
                "music": round(music_score, 4),
                "silence": round(silence_score, 4),
            })

        return results
