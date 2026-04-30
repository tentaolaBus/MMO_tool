"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clipScorer = exports.ClipScorer = void 0;
/**
 * High-value keywords for clip scoring (legacy fallback)
 * These words indicate potentially viral or engaging content
 */
const VIRAL_KEYWORDS = [
    'money', 'rich', 'wealth', 'financial', 'profit',
    'success', 'failure', 'win', 'lose', 'achieve',
    'life', 'death', 'living', 'survive',
    'love', 'hate', 'passion', 'emotion',
    'truth', 'lie', 'secret', 'hidden', 'reveal',
    'mindset', 'think', 'believe', 'realize',
    'business', 'entrepreneur', 'startup', 'company',
    'strategy', 'tactic', 'method', 'system',
    'mistake', 'lesson', 'learn', 'teach',
    'power', 'control', 'freedom', 'independence'
];
/**
 * ClipScorer - Scores clip candidates based on multiple factors.
 *
 * Supports two modes:
 *   1. Legacy: text-only scoring (durationScore + keywordScore + completenessScore)
 *   2. Multimodal: accepts pre-computed scores from the AI highlight service
 */
class ClipScorer {
    /**
     * Score a clip candidate (legacy text-only mode)
     */
    scoreClip(segments, startTime, endTime, startsAfterPause, endsAtPause) {
        const duration = endTime - startTime;
        const text = segments.map(s => s.text).join(' ');
        // Calculate individual scores
        const durationScore = this.calculateDurationScore(duration);
        const { keywordScore, keywords } = this.calculateKeywordScore(text);
        const completenessScore = this.calculateCompletenessScore(segments, startsAfterPause, endsAtPause);
        const total = durationScore + keywordScore + completenessScore;
        return {
            total,
            durationScore,
            keywordScore,
            completenessScore,
            keywords
        };
    }
    /**
     * Build a ClipScore from AI highlight analysis response.
     * Maps the multimodal scores into the ClipScore interface.
     */
    fromAIHighlight(highlight) {
        // Map AI features to legacy score categories for backward compatibility
        const b = highlight.breakdown || {};
        // Duration score: use the raw score proportion (0-40 range)
        const durationScore = Math.round((1 - Math.abs((b.rate_change || 0.5) - 0.5) * 2) * 40);
        // Keyword score: from keyword_score feature (0-30 range)
        const keywordScore = Math.round((b.keyword_score || 0) * 30);
        // Completeness score: from hook_score + sentiment_var (0-30 range)
        const completenessScore = Math.round(((b.hook_score || 0) * 0.5 + (b.sentiment_var || 0) * 0.5) * 30);
        return {
            total: highlight.score,
            durationScore,
            keywordScore,
            completenessScore,
            keywords: highlight.keywords || [],
            // Extended multimodal fields
            viralScore: highlight.viral_score,
            confidence: highlight.confidence,
            audioScore: (b.audio_energy || 0) * 0.4 + (b.speech_emotion || 0) * 0.3 +
                (b.laughter || 0) * 0.3,
            visualScore: (b.motion || 0) * 0.4 + (b.clip_visual || 0) * 0.4 +
                (b.scene_changes || 0) * 0.2,
            sentimentScore: b.sentiment_var || 0,
            hookScore: b.hook_score || 0,
            breakdown: b,
        };
    }
    /**
     * Duration Score (0-40 points)
     * Ideal: 30-45 seconds
     */
    calculateDurationScore(duration) {
        const ideal = 37.5; // midpoint of 30-45
        const deviation = Math.abs(duration - ideal);
        const score = Math.max(0, 40 - deviation * 2);
        return Math.round(score);
    }
    /**
     * Keyword Score (0-30 points)
     * 6 points per keyword match, capped at 30
     */
    calculateKeywordScore(text) {
        const lowerText = text.toLowerCase();
        const matchedKeywords = [];
        for (const keyword of VIRAL_KEYWORDS) {
            if (lowerText.includes(keyword)) {
                matchedKeywords.push(keyword);
            }
        }
        const keywordScore = Math.min(matchedKeywords.length * 6, 30);
        return { keywordScore, keywords: matchedKeywords };
    }
    /**
     * Completeness Score (0-30 points)
     */
    calculateCompletenessScore(segments, startsAfterPause, endsAtPause) {
        let score = 0;
        if (startsAfterPause)
            score += 10;
        if (endsAtPause)
            score += 10;
        const text = segments.map(s => s.text).join(' ');
        const hasSentenceEnding = /[.!?]$/.test(text.trim());
        if (hasSentenceEnding) {
            score += 10;
        }
        return score;
    }
}
exports.ClipScorer = ClipScorer;
exports.clipScorer = new ClipScorer();
