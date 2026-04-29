"""
Highlight Scoring Engine
========================
Combines multimodal features into a single composite score
per segment, with domain-specific weight presets and viral bonuses.
"""

import numpy as np
from typing import Dict, List, Any
from dataclasses import dataclass, field


# ═══════════════════════════════════════════════════════════════
# Domain-specific weight presets
# Each weight set sums to 1.0
# ═══════════════════════════════════════════════════════════════

DOMAIN_WEIGHTS: Dict[str, Dict[str, float]] = {
    "podcast": {
        "audio_energy":      0.05,
        "speech_emotion":    0.15,
        "laughter":          0.10,
        "crowd_noise":       0.02,
        "sentiment_var":     0.15,
        "keyword_score":     0.20,
        "hook_score":        0.15,
        "rate_change":       0.10,
        "motion":            0.02,
        "scene_changes":     0.01,
        "clip_visual":       0.05,
    },
    "sports": {
        "audio_energy":      0.25,
        "speech_emotion":    0.05,
        "laughter":          0.15,
        "crowd_noise":       0.20,
        "sentiment_var":     0.05,
        "keyword_score":     0.05,
        "hook_score":        0.02,
        "rate_change":       0.03,
        "motion":            0.15,
        "scene_changes":     0.03,
        "clip_visual":       0.02,
    },
    "movie": {
        "audio_energy":      0.10,
        "speech_emotion":    0.15,
        "laughter":          0.15,
        "crowd_noise":       0.05,
        "sentiment_var":     0.15,
        "keyword_score":     0.10,
        "hook_score":        0.05,
        "rate_change":       0.05,
        "motion":            0.10,
        "scene_changes":     0.05,
        "clip_visual":       0.05,
    },
}


class HighlightScorer:
    """
    Fuses multimodal features into a composite highlight score.

    Scoring formula:
        Score(segment) = Σᵢ (wᵢ × fᵢ) × 100

    Where wᵢ are domain-specific weights and fᵢ are normalized
    feature values in [0, 1].
    """

    def __init__(self, domain: str = "podcast"):
        self.domain = domain
        self.weights = DOMAIN_WEIGHTS.get(domain, DOMAIN_WEIGHTS["podcast"])

    def score_segments(self, segments: List[Dict],
                       features: Dict[str, List[float]]) -> List[Dict]:
        """
        Combine all feature arrays into a single composite score
        per segment.

        Args:
            segments: List of {"start", "end"} dicts
            features: Dict of feature_name → list of float values
                      (one per segment). Feature keys must match
                      the keys in DOMAIN_WEIGHTS.

        Returns:
            List of segment dicts with added "score" and "breakdown" fields.
        """
        n = len(segments)

        # ── Normalize each feature to [0, 1] ────────────────
        normalized: Dict[str, np.ndarray] = {}
        for key, values in features.items():
            arr = np.array(values, dtype=float)
            if len(arr) != n:
                # Pad or truncate to match segment count
                padded = np.zeros(n)
                padded[:min(len(arr), n)] = arr[:n]
                arr = padded

            vmin, vmax = arr.min(), arr.max()
            if vmax > vmin:
                normalized[key] = (arr - vmin) / (vmax - vmin)
            else:
                normalized[key] = np.full(n, 0.5)

        # ── Compute weighted composite score ─────────────────
        scored = []
        for i, seg in enumerate(segments):
            score = 0.0
            breakdown = {}

            for feature_name, weight in self.weights.items():
                if feature_name in normalized:
                    feat_val = float(normalized[feature_name][i])
                    score += weight * feat_val
                    breakdown[feature_name] = round(feat_val, 4)

            scored.append({
                **seg,
                "score": round(score * 100, 2),
                "breakdown": breakdown,
            })

        return scored

    def apply_viral_bonus(self, scored_segments: List[Dict],
                          hook_scores: List[float],
                          sentiment_vars: List[float]) -> List[Dict]:
        """
        Apply viral awareness bonuses on top of the base score.

        Viral bonuses:
          +15%  if hook_score > 0.7         (strong opening hook)
          +10%  if duration in [15s, 45s]   (TikTok-optimal length)
          +10%  if sentiment_variance > 0.6 (emotional rollercoaster)
          +5%   if hook_score > 0.4         (moderate hook)
        """
        n = len(scored_segments)

        for i, seg in enumerate(scored_segments):
            bonus = 0.0

            # Hook strength
            hook = hook_scores[i] if i < len(hook_scores) else 0.0
            if hook > 0.7:
                bonus += 0.15
            elif hook > 0.4:
                bonus += 0.05

            # Optimal duration for short-form
            duration = seg["end"] - seg["start"]
            if 15 <= duration <= 45:
                bonus += 0.10
            elif 45 < duration <= 60:
                bonus += 0.05

            # Emotional arc
            sent_var = sentiment_vars[i] if i < len(sentiment_vars) else 0.0
            if sent_var > 0.6:
                bonus += 0.10
            elif sent_var > 0.3:
                bonus += 0.05

            seg["viral_score"] = round(seg["score"] * (1 + bonus), 2)
            seg["viral_bonus"] = round(bonus, 3)

        return scored_segments


class ClipSelector:
    """
    Selects top-N clips using Non-Maximum Suppression (NMS)
    to avoid temporal overlap.
    """

    def __init__(self, max_clips: int = 10,
                 iou_threshold: float = 0.3,
                 min_duration: float = 15.0,
                 max_duration: float = 60.0):
        self.max_clips = max_clips
        self.iou_threshold = iou_threshold
        self.min_duration = min_duration
        self.max_duration = max_duration

    def select(self, scored_segments: List[Dict]) -> List[Dict]:
        """
        Select the best non-overlapping clips.

        Steps:
          1. Filter by duration constraints
          2. Sort by viral_score (or score) descending
          3. Greedy NMS: skip segments that overlap too much
          4. Return sorted by start time
        """
        # Duration filter
        valid = [
            seg for seg in scored_segments
            if self.min_duration <= (seg["end"] - seg["start"]) <= self.max_duration
        ]

        # Sort by viral_score then score
        valid.sort(
            key=lambda s: s.get("viral_score", s["score"]),
            reverse=True,
        )

        selected = []
        for seg in valid:
            # Check overlap with already selected
            has_overlap = any(
                self._temporal_iou(seg, sel) > self.iou_threshold
                for sel in selected
            )

            if not has_overlap:
                selected.append(seg)

            if len(selected) >= self.max_clips:
                break

        # Return sorted by start time for chronological order
        return sorted(selected, key=lambda s: s["start"])

    @staticmethod
    def _temporal_iou(seg1: Dict, seg2: Dict) -> float:
        """Compute Intersection over Union for two temporal segments."""
        inter_start = max(seg1["start"], seg2["start"])
        inter_end = min(seg1["end"], seg2["end"])
        intersection = max(0.0, inter_end - inter_start)

        dur1 = seg1["end"] - seg1["start"]
        dur2 = seg2["end"] - seg2["start"]
        union = dur1 + dur2 - intersection

        return intersection / union if union > 0 else 0.0
