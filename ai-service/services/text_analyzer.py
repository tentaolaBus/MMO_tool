"""
Text Feature Extraction Module
================================
Extracts features from transcript text:
  - Sentiment analysis (RoBERTa)
  - Keyword extraction (KeyBERT)
  - Hook / engagement pattern detection (regex heuristics)
  - Speaking rate analysis (words per minute)
"""

import re
import time
import numpy as np
from typing import Dict, List, Any, Optional


# ── Domain-Specific Keyword Banks ────────────────────────────

DOMAIN_KEYWORDS = {
    "podcast": [
        "money", "rich", "wealth", "financial", "profit",
        "success", "failure", "win", "lose", "achieve",
        "life", "death", "living", "survive",
        "love", "hate", "passion", "emotion",
        "truth", "lie", "secret", "hidden", "reveal",
        "mindset", "think", "believe", "realize",
        "business", "entrepreneur", "startup", "company",
        "strategy", "tactic", "method", "system",
        "mistake", "lesson", "learn", "teach",
        "power", "control", "freedom", "independence",
        "actually", "most people", "the problem is",
        "here's the thing", "let me tell you",
        "nobody talks about", "game changer",
    ],
    "sports": [
        "goal", "score", "win", "championship", "record",
        "incredible", "amazing", "unbelievable", "clutch",
        "overtime", "comeback", "save", "tackle", "knockout",
        "finish", "penalty", "foul", "champion", "mvp",
        "assist", "pass", "shot", "defense", "attack",
        "halftime", "final", "playoff", "tournament",
    ],
    "movie": [
        "love", "death", "revenge", "betrayal", "truth",
        "family", "power", "choice", "destiny", "sacrifice",
        "promise", "remember", "forget", "forgive",
        "hero", "villain", "fight", "escape", "discover",
        "believe", "fear", "hope", "dream", "courage",
    ],
}

# ── Hook Patterns for Viral Detection ────────────────────────

HOOK_PATTERNS = [
    # Questions that create curiosity gaps
    (r"\b(do you know|did you know|have you ever)\b", 0.30),
    (r"\b(what if|what would happen|imagine)\b", 0.25),
    (r"\b(why do|why does|why is|how come)\b", 0.20),

    # Contrarian / bold claims
    (r"\b(actually|the truth is|here's the thing)\b", 0.20),
    (r"\b(most people|nobody|everyone thinks|they don't)\b", 0.20),
    (r"\b(wrong about|biggest mistake|stop doing)\b", 0.25),

    # Story openers
    (r"\b(so one time|let me tell you|I remember when)\b", 0.20),
    (r"\b(picture this|there was this|you won't believe)\b", 0.20),

    # Urgency / exclusivity
    (r"\b(secret|hidden|they don't want you)\b", 0.25),
    (r"\b(never|always|every single|guaranteed)\b", 0.10),

    # Questions in general (any "?")
    (r"\?", 0.08),
]


class TextAnalyzer:
    """
    Analyzes transcript text for sentiment, keywords, hooks,
    and speaking rate — all signals that predict engagement.
    """

    def __init__(self):
        self.sentiment_pipeline = None
        self.keyword_model = None
        self._models_loaded = False

    # ── Model Lifecycle ──────────────────────────────────────

    def load_models(self):
        """Load text analysis models (CPU only — lightweight)."""
        if self._models_loaded:
            return

        print("📝 Loading text analysis models...")
        start = time.time()

        try:
            from transformers import pipeline as hf_pipeline
            self.sentiment_pipeline = hf_pipeline(
                "sentiment-analysis",
                model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                device=-1,  # CPU
                truncation=True,
                max_length=512,
            )
            print("   Sentiment model loaded")
        except Exception as e:
            print(f"   ⚠️ Sentiment model failed: {e}")
            self.sentiment_pipeline = None

        try:
            from keybert import KeyBERT
            self.keyword_model = KeyBERT("all-MiniLM-L6-v2")
            print("   KeyBERT model loaded")
        except Exception as e:
            print(f"   ⚠️ KeyBERT failed: {e}")
            self.keyword_model = None

        elapsed = time.time() - start
        print(f"   Text models ready in {elapsed:.1f}s")
        self._models_loaded = True

    def unload_models(self):
        """Free memory."""
        del self.sentiment_pipeline
        del self.keyword_model
        self.sentiment_pipeline = None
        self.keyword_model = None
        self._models_loaded = False

    # ── Helpers ──────────────────────────────────────────────

    @staticmethod
    def get_text_for_segment(seg: Dict, transcript: Dict) -> str:
        """
        Extract transcript text that overlaps with a temporal segment.
        """
        text_parts = []
        for t_seg in transcript.get("segments", []):
            # Check temporal overlap
            if t_seg["end"] > seg["start"] and t_seg["start"] < seg["end"]:
                text_parts.append(t_seg["text"])
        return " ".join(text_parts).strip()

    @staticmethod
    def get_words_for_segment(seg: Dict, transcript: Dict) -> List[Dict]:
        """
        Extract word-level data that overlaps with a temporal segment.
        """
        words = []
        for t_seg in transcript.get("segments", []):
            if t_seg["end"] > seg["start"] and t_seg["start"] < seg["end"]:
                for w in t_seg.get("words", []):
                    if w["end"] > seg["start"] and w["start"] < seg["end"]:
                        words.append(w)
        return words

    # ── Sentiment Analysis ───────────────────────────────────

    def analyze_sentiment(self, segments: List[Dict],
                          transcript: Dict) -> List[Dict]:
        """
        Compute sentiment per segment. High variance indicates
        an emotional arc (setup → tension → resolution).

        Returns per segment:
            {
                "sentiment": "positive" | "negative" | "neutral",
                "score": 0.0-1.0,
                "variance": 0.0-1.0  (emotional arc indicator)
            }
        """
        results = []

        for seg in segments:
            text = self.get_text_for_segment(seg, transcript)

            if not text.strip():
                results.append({
                    "sentiment": "neutral",
                    "score": 0.5,
                    "variance": 0.0,
                })
                continue

            if self.sentiment_pipeline is None:
                # Fallback: simple keyword heuristic
                results.append(self._heuristic_sentiment(text))
                continue

            try:
                # Split into sentences for variance calculation
                sentences = [s.strip() for s in re.split(r'[.!?]+', text)
                             if s.strip() and len(s.strip()) > 5]
                if not sentences:
                    sentences = [text]

                # Batch predict sentiment
                preds = self.sentiment_pipeline(
                    sentences[:20],  # Cap at 20 sentences
                    truncation=True,
                    max_length=512,
                )

                # Map labels to numerical scores for variance
                label_map = {"positive": 1.0, "neutral": 0.5, "negative": 0.0}
                scores = []
                for p in preds:
                    label = p["label"].lower()
                    if label in label_map:
                        scores.append(label_map[label] * p["score"])
                    else:
                        scores.append(0.5)

                # Overall sentiment = majority label
                dominant = preds[0]
                variance = float(np.var(scores)) if len(scores) > 1 else 0.0

                results.append({
                    "sentiment": dominant["label"].lower(),
                    "score": round(dominant["score"], 4),
                    "variance": round(variance, 4),
                })

            except Exception as e:
                print(f"   ⚠️ Sentiment failed: {e}")
                results.append({
                    "sentiment": "neutral",
                    "score": 0.5,
                    "variance": 0.0,
                })

        return results

    @staticmethod
    def _heuristic_sentiment(text: str) -> Dict:
        """Simple sentiment fallback when model isn't available."""
        positive = ["good", "great", "love", "amazing", "awesome",
                     "happy", "beautiful", "wonderful", "excellent"]
        negative = ["bad", "terrible", "hate", "awful", "horrible",
                     "sad", "angry", "worst", "ugly", "disgusting"]

        lower = text.lower()
        pos_count = sum(1 for w in positive if w in lower)
        neg_count = sum(1 for w in negative if w in lower)

        if pos_count > neg_count:
            return {"sentiment": "positive", "score": 0.7, "variance": 0.0}
        elif neg_count > pos_count:
            return {"sentiment": "negative", "score": 0.7, "variance": 0.0}
        else:
            return {"sentiment": "neutral", "score": 0.5, "variance": 0.0}

    # ── Keyword Extraction ───────────────────────────────────

    def extract_keywords(self, segments: List[Dict],
                         transcript: Dict,
                         domain: str = "podcast") -> List[Dict]:
        """
        Extract keywords using KeyBERT + match against domain-specific lists.

        Returns per segment:
            {
                "keywords": [("keyword", 0.85), ...],
                "domain_matches": ["money", "success"],
                "keyword_score": 0.0-1.0
            }
        """
        domain_kws = DOMAIN_KEYWORDS.get(domain, DOMAIN_KEYWORDS["podcast"])
        results = []

        for seg in segments:
            text = self.get_text_for_segment(seg, transcript)

            if not text.strip():
                results.append({
                    "keywords": [],
                    "domain_matches": [],
                    "keyword_score": 0.0,
                })
                continue

            # KeyBERT extraction
            extracted = []
            if self.keyword_model is not None:
                try:
                    extracted = self.keyword_model.extract_keywords(
                        text,
                        keyphrase_ngram_range=(1, 2),
                        stop_words="english",
                        top_n=5,
                    )
                except Exception:
                    pass

            # Domain keyword matching
            lower_text = text.lower()
            domain_matches = [kw for kw in domain_kws if kw in lower_text]

            # Score: ratio of matched domain keywords (capped)
            keyword_score = min(1.0, len(domain_matches) * 0.15)

            results.append({
                "keywords": extracted,
                "domain_matches": domain_matches,
                "keyword_score": round(keyword_score, 4),
            })

        return results

    # ── Hook Detection ───────────────────────────────────────

    def detect_hooks(self, segments: List[Dict],
                     transcript: Dict) -> List[Dict]:
        """
        Detect viral hook patterns that increase engagement.

        Returns per segment:
            {"hook_score": 0.0-1.0, "hook_patterns": [...]}
        """
        results = []

        for seg in segments:
            text = self.get_text_for_segment(seg, transcript).lower()

            if not text.strip():
                results.append({"hook_score": 0.0, "hook_patterns": []})
                continue

            hook_score = 0.0
            matched_patterns = []

            for pattern, weight in HOOK_PATTERNS:
                if re.search(pattern, text):
                    hook_score += weight
                    matched_patterns.append(pattern)

            results.append({
                "hook_score": round(min(1.0, hook_score), 4),
                "hook_patterns": matched_patterns,
            })

        return results

    # ── Speaking Rate Analysis ───────────────────────────────

    def analyze_speaking_rate(self, segments: List[Dict],
                              transcript: Dict) -> List[Dict]:
        """
        Calculate words-per-minute and rate change per segment.
        High rate change = emphasis/excitement.

        Returns per segment:
            {"wpm": 150.0, "rate_change": 0.3}
        """
        # First pass: compute global average WPM
        all_wpms = []
        seg_data = []

        for seg in segments:
            words = self.get_words_for_segment(seg, transcript)
            duration = seg["end"] - seg["start"]

            if duration < 1.0 or len(words) < 2:
                seg_data.append({"wpm": 0.0, "rate_change": 0.0})
                continue

            wpm = (len(words) / duration) * 60.0
            all_wpms.append(wpm)
            seg_data.append({"wpm": wpm, "rate_change": 0.0})

        # Second pass: compute rate change relative to average
        avg_wpm = np.mean(all_wpms) if all_wpms else 150.0

        results = []
        for sd in seg_data:
            if sd["wpm"] > 0 and avg_wpm > 0:
                rate_change = abs(sd["wpm"] - avg_wpm) / avg_wpm
            else:
                rate_change = 0.0

            results.append({
                "wpm": round(sd["wpm"], 1),
                "rate_change": round(min(1.0, rate_change), 4),
            })

        return results
