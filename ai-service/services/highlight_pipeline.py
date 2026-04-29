"""
Highlight Pipeline — Main Orchestrator
========================================
Coordinates the full highlight extraction pipeline:
  1. Preprocessing (FFmpeg audio + keyframes)
  2. Audio analysis (Whisper + energy + emotion + events)
  3. Text analysis  (sentiment + keywords + hooks + speaking rate)
  4. Visual analysis (motion + scene changes + CLIP)
  5. Scoring (domain-weighted fusion + viral bonus)
  6. Selection (NMS-based top-N)

GPU Memory Strategy (RTX 2050, 4GB VRAM):
  Phase 2 loads Whisper + emotion → unloads
  Phase 4 loads CLIP → unloads
  Never exceeds ~2.5GB peak.
"""

import os
import json
import time
import subprocess
import numpy as np
import librosa
from dataclasses import dataclass
from typing import Dict, List, Any, Optional

from services.audio_analyzer import AudioAnalyzer
from services.text_analyzer import TextAnalyzer
from services.visual_analyzer import VisualAnalyzer
from services.highlight_scorer import HighlightScorer, ClipSelector


@dataclass
class PipelineConfig:
    """Configuration for the highlight extraction pipeline."""

    # Whisper
    whisper_model: str = "medium"
    device: str = "auto"            # "cuda", "cpu", or "auto"

    # Keyframe extraction
    keyframe_fps: int = 1

    # Temporal segmentation
    segment_window: float = 45.0    # seconds per segment
    segment_stride: float = 15.0    # overlap stride
    min_clip_duration: float = 15.0
    max_clip_duration: float = 60.0

    # Output
    max_clips: int = 10
    nms_iou_threshold: float = 0.3

    # Feature toggles
    skip_visual_for_podcast: bool = True  # Skip expensive visual analysis


class HighlightPipeline:
    """
    End-to-end multimodal highlight extraction.

    Usage:
        pipeline = HighlightPipeline()
        result = pipeline.process(
            video_path="video.mp4",
            category="podcast",
            job_id="abc-123",
            storage_dir="./storage/analysis/abc-123"
        )
    """

    def __init__(self, config: PipelineConfig = None):
        self.config = config or PipelineConfig()
        self.audio_analyzer = AudioAnalyzer()
        self.text_analyzer = TextAnalyzer()
        self.visual_analyzer = VisualAnalyzer()

    # ═══════════════════════════════════════════════════════════
    # PUBLIC API
    # ═══════════════════════════════════════════════════════════

    def process(self, video_path: str,
                category: str = "podcast",
                job_id: str = "",
                storage_dir: str = "",
                progress_callback=None) -> Dict[str, Any]:
        """
        Run the full highlight extraction pipeline.

        Args:
            video_path:  Path to input video file
            category:    "podcast" | "sports" | "movie"
            job_id:      Unique job identifier
            storage_dir: Directory for intermediate files
            progress_callback: Optional callable(phase, percent, message)

        Returns:
            {
                "job_id": "...",
                "category": "podcast",
                "video_duration": 300.5,
                "language": "en",
                "total_segments_analyzed": 20,
                "processing_time_seconds": 45.2,
                "clips": [
                    {
                        "start": 45.2,
                        "end": 82.7,
                        "duration": 37.5,
                        "score": 87.3,
                        "viral_score": 96.0,
                        "confidence": 0.92,
                        "breakdown": {...},
                        "keywords": ["money", "mindset"],
                        "text": "transcript text..."
                    },
                    ...
                ]
            }
        """
        pipeline_start = time.time()

        if not storage_dir:
            storage_dir = f"./storage/analysis/{job_id}"
        os.makedirs(storage_dir, exist_ok=True)

        def _progress(phase: str, pct: int, msg: str):
            print(f"   [{phase}] {pct}% — {msg}")
            if progress_callback:
                progress_callback(phase, pct, msg)

        # ── Phase 1: Preprocessing ───────────────────────────
        _progress("PREPROCESS", 0, "Starting preprocessing...")

        audio_path = os.path.join(storage_dir, "audio.wav")
        keyframe_dir = os.path.join(storage_dir, "keyframes")

        self._extract_audio(video_path, audio_path)
        _progress("PREPROCESS", 30, "Audio extracted")

        # Only extract keyframes if we'll use them
        skip_visual = (
            category == "podcast" and
            self.config.skip_visual_for_podcast
        )

        if not skip_visual:
            self._extract_keyframes(video_path, keyframe_dir)
            _progress("PREPROCESS", 60, "Keyframes extracted")
        else:
            _progress("PREPROCESS", 60, "Skipping keyframes (podcast mode)")

        _progress("PREPROCESS", 100, "Preprocessing complete")

        # ── Phase 2: Audio Analysis (GPU) ────────────────────
        _progress("AUDIO", 0, "Loading audio models...")

        self.audio_analyzer.load_models(
            whisper_size=self.config.whisper_model,
            device=self.config.device,
        )
        _progress("AUDIO", 10, "Models loaded")

        # Transcribe
        transcript = self.audio_analyzer.transcribe(audio_path)
        _progress("AUDIO", 40, f"Transcribed ({transcript['language']})")

        # Create temporal segments
        segments = self._create_segments(transcript["duration"])
        _progress("AUDIO", 50, f"Created {len(segments)} segments")

        # Energy analysis
        energy = self.audio_analyzer.analyze_energy(audio_path, segments)
        _progress("AUDIO", 65, "Energy analysis done")

        # Emotion analysis
        emotion = self.audio_analyzer.analyze_emotion(audio_path, segments)
        _progress("AUDIO", 80, "Emotion analysis done")

        # Audio event detection
        audio_events = self.audio_analyzer.detect_audio_events(
            audio_path, segments
        )
        _progress("AUDIO", 90, "Audio events detected")

        # Free GPU for visual phase
        self.audio_analyzer.unload_models()
        _progress("AUDIO", 100, "Audio phase complete, GPU freed")

        # ── Phase 3: Text Analysis (CPU) ─────────────────────
        _progress("TEXT", 0, "Loading text models...")

        self.text_analyzer.load_models()
        _progress("TEXT", 10, "Models loaded")

        sentiments = self.text_analyzer.analyze_sentiment(
            segments, transcript
        )
        _progress("TEXT", 35, "Sentiment analysis done")

        keywords = self.text_analyzer.extract_keywords(
            segments, transcript, category
        )
        _progress("TEXT", 55, "Keywords extracted")

        hooks = self.text_analyzer.detect_hooks(segments, transcript)
        _progress("TEXT", 75, "Hook detection done")

        speaking_rate = self.text_analyzer.analyze_speaking_rate(
            segments, transcript
        )
        _progress("TEXT", 90, "Speaking rate analyzed")

        self.text_analyzer.unload_models()
        _progress("TEXT", 100, "Text phase complete")

        # ── Phase 4: Visual Analysis (GPU) ───────────────────
        if not skip_visual:
            _progress("VISUAL", 0, "Loading visual models...")

            self.visual_analyzer.load_models(device=self.config.device)
            _progress("VISUAL", 10, "Models loaded")

            motion = self.visual_analyzer.analyze_motion(
                keyframe_dir, segments, fps=self.config.keyframe_fps
            )
            _progress("VISUAL", 40, "Motion analysis done")

            scene_changes = self.visual_analyzer.detect_scene_changes(
                video_path, segments
            )
            _progress("VISUAL", 60, "Scene detection done")

            clip_visual = self.visual_analyzer.analyze_with_clip(
                keyframe_dir, segments,
                fps=self.config.keyframe_fps,
                domain=category,
            )
            _progress("VISUAL", 90, "CLIP analysis done")

            self.visual_analyzer.unload_models()
            _progress("VISUAL", 100, "Visual phase complete")
        else:
            _progress("VISUAL", 100, "Skipped (podcast mode)")
            n = len(segments)
            motion = [{"motion_mean": 0.0}] * n
            scene_changes = [{"scene_change_rate": 0.0}] * n
            clip_visual = [{"clip_score": 0.0}] * n

        # ── Phase 5: Scoring ─────────────────────────────────
        _progress("SCORING", 0, "Computing scores...")

        # Build feature arrays (one float per segment per feature)
        features = {
            "audio_energy":   [e["mean_energy"] for e in energy],
            "speech_emotion": [e["emotion_score"] for e in emotion],
            "laughter":       [e["laughter"] for e in audio_events],
            "crowd_noise":    [e["crowd_noise"] for e in audio_events],
            "sentiment_var":  [s["variance"] for s in sentiments],
            "keyword_score":  [k["keyword_score"] for k in keywords],
            "hook_score":     [h["hook_score"] for h in hooks],
            "rate_change":    [r["rate_change"] for r in speaking_rate],
            "motion":         [m["motion_mean"] for m in motion],
            "scene_changes":  [s["scene_change_rate"] for s in scene_changes],
            "clip_visual":    [c["clip_score"] for c in clip_visual],
        }

        scorer = HighlightScorer(domain=category)
        scored = scorer.score_segments(segments, features)
        _progress("SCORING", 50, "Base scores computed")

        scored = scorer.apply_viral_bonus(
            scored,
            hook_scores=[h["hook_score"] for h in hooks],
            sentiment_vars=[s["variance"] for s in sentiments],
        )
        _progress("SCORING", 100, "Viral bonuses applied")

        # ── Phase 6: Selection ───────────────────────────────
        _progress("SELECT", 0, "Selecting top clips...")

        selector = ClipSelector(
            max_clips=self.config.max_clips,
            iou_threshold=self.config.nms_iou_threshold,
            min_duration=self.config.min_clip_duration,
            max_duration=self.config.max_clip_duration,
        )
        final_clips = selector.select(scored)
        _progress("SELECT", 100, f"Selected {len(final_clips)} clips")

        # ── Build response ───────────────────────────────────
        pipeline_elapsed = time.time() - pipeline_start

        # Enrich clips with text + keywords
        result_clips = []
        for clip in final_clips:
            # Find matching keyword data
            clip_text = TextAnalyzer.get_text_for_segment(clip, transcript)
            seg_idx = next(
                (i for i, s in enumerate(segments)
                 if s["start"] == clip["start"] and s["end"] == clip["end"]),
                None,
            )
            matched_kws = (
                keywords[seg_idx]["domain_matches"]
                if seg_idx is not None else []
            )

            result_clips.append({
                "start": clip["start"],
                "end": clip["end"],
                "duration": round(clip["end"] - clip["start"], 2),
                "score": clip["score"],
                "viral_score": clip.get("viral_score", clip["score"]),
                "confidence": round(
                    min(1.0, clip["score"] / 80.0), 2
                ),
                "breakdown": clip.get("breakdown", {}),
                "keywords": matched_kws,
                "text": clip_text[:500],  # cap text length
            })

        result = {
            "job_id": job_id,
            "category": category,
            "video_duration": transcript["duration"],
            "language": transcript["language"],
            "total_segments_analyzed": len(segments),
            "processing_time_seconds": round(pipeline_elapsed, 1),
            "clips": result_clips,
        }

        # Save analysis result
        result_path = os.path.join(storage_dir, "highlights.json")
        with open(result_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        print(f"\n✅ Pipeline complete: {len(result_clips)} highlights "
              f"in {pipeline_elapsed:.1f}s")

        return result

    # ═══════════════════════════════════════════════════════════
    # PRIVATE HELPERS
    # ═══════════════════════════════════════════════════════════

    def _extract_audio(self, video_path: str, output_path: str):
        """Extract 16kHz mono WAV using FFmpeg."""
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vn",
            "-ar", "16000",
            "-ac", "1",
            "-f", "wav",
            output_path,
        ]

        print(f"   Extracting audio → {output_path}")
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=600,
        )

        if result.returncode != 0:
            raise RuntimeError(
                f"FFmpeg audio extraction failed: {result.stderr[-300:]}"
            )

    def _extract_keyframes(self, video_path: str, output_dir: str):
        """Extract keyframes at specified FPS using FFmpeg."""
        os.makedirs(output_dir, exist_ok=True)

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vf", f"fps={self.config.keyframe_fps}",
            "-q:v", "2",
            os.path.join(output_dir, "%06d.jpg"),
        ]

        print(f"   Extracting keyframes → {output_dir}")
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=600,
        )

        if result.returncode != 0:
            raise RuntimeError(
                f"FFmpeg keyframe extraction failed: {result.stderr[-300:]}"
            )

    def _create_segments(self, duration: float) -> List[Dict]:
        """
        Create overlapping temporal segments using sliding window.

        Returns list of {"start": float, "end": float}.
        """
        segments = []
        start = 0.0
        window = self.config.segment_window
        stride = self.config.segment_stride

        while start < duration:
            end = min(start + window, duration)
            seg_duration = end - start

            # Only include if long enough to be a valid clip
            if seg_duration >= self.config.min_clip_duration:
                segments.append({
                    "start": round(start, 3),
                    "end": round(end, 3),
                })

            start += stride

        return segments
