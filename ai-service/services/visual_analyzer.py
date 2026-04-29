"""
Visual Feature Extraction Module
=================================
Extracts visual features from video keyframes:
  - Motion intensity (optical flow)
  - Scene change detection (PySceneDetect)
  - CLIP visual-semantic similarity
"""

import os
import time
import numpy as np
from typing import Dict, List, Any, Optional


# ── CLIP Prompt Templates per Domain ─────────────────────────

CLIP_PROMPTS = {
    "podcast": [
        "a person speaking passionately and gesticulating",
        "an insightful conversation between two people",
        "a heated debate or argument between speakers",
        "a person with a surprised or shocked expression",
        "someone laughing during an interview",
    ],
    "sports": [
        "an exciting sports play or action moment",
        "a goal celebration with cheering players",
        "a crowd cheering at a stadium",
        "an athlete performing an incredible athletic move",
        "a dramatic sports competition finish",
    ],
    "movie": [
        "an emotional dramatic scene with intense acting",
        "a funny comedic moment that makes people laugh",
        "a tense suspenseful scene with dramatic lighting",
        "characters in an intense argument or confrontation",
        "a heartwarming emotional reunion scene",
    ],
}


class VisualAnalyzer:
    """
    Analyzes video keyframes for motion, scene changes,
    and semantic content using CLIP.

    Loaded AFTER audio models are unloaded to conserve GPU RAM.
    """

    def __init__(self):
        self.clip_model = None
        self.clip_processor = None
        self._models_loaded = False

    # ── Model Lifecycle ──────────────────────────────────────

    def load_models(self, device: str = "auto"):
        """Load CLIP model for visual-semantic analysis."""
        if self._models_loaded:
            return

        import torch
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"

        print(f"👁️ Loading CLIP model on {device}...")
        start = time.time()

        try:
            from transformers import CLIPModel, CLIPProcessor

            self.clip_model = CLIPModel.from_pretrained(
                "openai/clip-vit-base-patch32"
            )
            if device == "cuda":
                self.clip_model = self.clip_model.to("cuda")
            self.clip_model.eval()

            self.clip_processor = CLIPProcessor.from_pretrained(
                "openai/clip-vit-base-patch32"
            )

            elapsed = time.time() - start
            print(f"   CLIP loaded in {elapsed:.1f}s on {device}")
        except Exception as e:
            print(f"   ⚠️ CLIP failed to load: {e}")
            self.clip_model = None
            self.clip_processor = None

        self._models_loaded = True

    def unload_models(self):
        """Free GPU memory."""
        del self.clip_model
        del self.clip_processor
        self.clip_model = None
        self.clip_processor = None
        self._models_loaded = False

        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass

        print("👁️ Visual models unloaded")

    # ── Motion Analysis ──────────────────────────────────────

    def analyze_motion(self, keyframe_dir: str,
                       segments: List[Dict],
                       fps: int = 1) -> List[Dict]:
        """
        Compute optical flow-based motion intensity per segment.

        Uses Farneback dense optical flow between consecutive keyframes.
        High motion = action-packed content (sports, fights, chases).

        Returns per segment:
            {"motion_mean", "motion_max", "motion_var"}
        """
        import cv2

        if not os.path.isdir(keyframe_dir):
            return [{"motion_mean": 0, "motion_max": 0, "motion_var": 0}
                    for _ in segments]

        frames = sorted([
            f for f in os.listdir(keyframe_dir)
            if f.lower().endswith(('.jpg', '.jpeg', '.png'))
        ])

        if len(frames) < 2:
            return [{"motion_mean": 0, "motion_max": 0, "motion_var": 0}
                    for _ in segments]

        # Pre-compute all frame-pair magnitudes
        frame_magnitudes = {}
        prev_gray = None

        for i, fname in enumerate(frames):
            fpath = os.path.join(keyframe_dir, fname)
            img = cv2.imread(fpath, cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue

            # Resize for speed (optical flow is expensive)
            img = cv2.resize(img, (320, 240))

            if prev_gray is not None:
                flow = cv2.calcOpticalFlowFarneback(
                    prev_gray, img, None,
                    pyr_scale=0.5,
                    levels=3,
                    winsize=15,
                    iterations=3,
                    poly_n=5,
                    poly_sigma=1.2,
                    flags=0,
                )
                mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
                frame_magnitudes[i] = float(np.mean(mag))

            prev_gray = img

        results = []
        for seg in segments:
            start_frame = int(seg["start"] * fps)
            end_frame = int(seg["end"] * fps)

            magnitudes = [
                frame_magnitudes[i]
                for i in range(start_frame, min(end_frame + 1, len(frames)))
                if i in frame_magnitudes
            ]

            if magnitudes:
                results.append({
                    "motion_mean": round(float(np.mean(magnitudes)), 4),
                    "motion_max": round(float(np.max(magnitudes)), 4),
                    "motion_var": round(float(np.var(magnitudes)), 4),
                })
            else:
                results.append({
                    "motion_mean": 0.0,
                    "motion_max": 0.0,
                    "motion_var": 0.0,
                })

        return results

    # ── Scene Change Detection ───────────────────────────────

    def detect_scene_changes(self, video_path: str,
                             segments: List[Dict]) -> List[Dict]:
        """
        Detect scene changes using PySceneDetect.
        High scene change frequency = dynamic editing = likely highlight.

        Returns per segment:
            {"scene_changes": 3, "scene_change_rate": 0.1}
        """
        try:
            from scenedetect import detect, ContentDetector

            scene_list = detect(
                video_path,
                ContentDetector(threshold=27.0),
                show_progress=False,
            )

            # Convert to list of timestamps in seconds
            boundaries = []
            for scene in scene_list:
                start_sec = scene[0].get_seconds()
                end_sec = scene[1].get_seconds()
                boundaries.append(start_sec)
                boundaries.append(end_sec)
            boundaries = sorted(set(boundaries))

        except Exception as e:
            print(f"   ⚠️ Scene detection failed: {e}")
            boundaries = []

        results = []
        for seg in segments:
            # Count scene boundaries within this segment
            changes = sum(
                1 for b in boundaries
                if seg["start"] < b < seg["end"]
            )
            duration = seg["end"] - seg["start"]
            rate = changes / duration if duration > 0 else 0

            results.append({
                "scene_changes": changes,
                "scene_change_rate": round(rate, 4),
            })

        return results

    # ── CLIP Visual-Semantic Analysis ────────────────────────

    def analyze_with_clip(self, keyframe_dir: str,
                          segments: List[Dict],
                          fps: int = 1,
                          domain: str = "podcast") -> List[Dict]:
        """
        Compute CLIP similarity between keyframes and
        domain-specific text prompts.

        For each segment, samples up to 5 keyframes and
        computes max similarity to highlight-related prompts.

        Returns per segment:
            {"clip_score": 0.7, "best_prompt": "exciting action"}
        """
        if self.clip_model is None or self.clip_processor is None:
            return [{"clip_score": 0.0, "best_prompt": ""}
                    for _ in segments]

        import torch
        from PIL import Image

        prompts = CLIP_PROMPTS.get(domain, CLIP_PROMPTS["podcast"])
        frames = sorted([
            f for f in os.listdir(keyframe_dir)
            if f.lower().endswith(('.jpg', '.jpeg', '.png'))
        ])

        if not frames:
            return [{"clip_score": 0.0, "best_prompt": ""}
                    for _ in segments]

        device = next(self.clip_model.parameters()).device
        results = []

        for seg in segments:
            start_frame = int(seg["start"] * fps)
            end_frame = int(seg["end"] * fps)
            seg_frames = frames[start_frame:end_frame + 1]

            if not seg_frames:
                results.append({"clip_score": 0.0, "best_prompt": ""})
                continue

            # Sample up to 5 evenly spaced frames
            indices = np.linspace(
                0, len(seg_frames) - 1,
                min(5, len(seg_frames)),
            ).astype(int)
            sampled = [seg_frames[i] for i in indices]

            max_score = 0.0
            best_prompt = ""

            for frame_name in sampled:
                fpath = os.path.join(keyframe_dir, frame_name)
                try:
                    image = Image.open(fpath).convert("RGB")

                    inputs = self.clip_processor(
                        text=prompts,
                        images=image,
                        return_tensors="pt",
                        padding=True,
                    )
                    # Move inputs to device
                    inputs = {k: v.to(device) for k, v in inputs.items()}

                    with torch.no_grad():
                        outputs = self.clip_model(**inputs)
                        logits = outputs.logits_per_image.softmax(dim=1)
                        score = float(logits.max())
                        idx = int(logits.argmax())

                    if score > max_score:
                        max_score = score
                        best_prompt = prompts[idx]

                except Exception as e:
                    continue

            results.append({
                "clip_score": round(max_score, 4),
                "best_prompt": best_prompt,
            })

        return results
