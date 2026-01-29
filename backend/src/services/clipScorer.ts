import { TranscriptSegment } from '../models/job';
import { ClipScore } from '../models/clip';

/**
 * High-value keywords for clip scoring
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
 * ClipScorer - Scores clip candidates based on multiple factors
 */
export class ClipScorer {
    /**
     * Score a clip candidate
     */
    scoreClip(
        segments: TranscriptSegment[],
        startTime: number,
        endTime: number,
        startsAfterPause: boolean,
        endsAtPause: boolean
    ): ClipScore {
        const duration = endTime - startTime;
        const text = segments.map(s => s.text).join(' ');

        // Calculate individual scores
        const durationScore = this.calculateDurationScore(duration);
        const { keywordScore, keywords } = this.calculateKeywordScore(text);
        const completenessScore = this.calculateCompletenessScore(
            segments,
            startsAfterPause,
            endsAtPause
        );

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
     * Duration Score (0-40 points)
     * Ideal: 30-45 seconds
     * Formula: 40 - abs(duration - 37.5) * 2
     */
    private calculateDurationScore(duration: number): number {
        const ideal = 37.5; // midpoint of 30-45
        const deviation = Math.abs(duration - ideal);
        const score = Math.max(0, 40 - deviation * 2);
        return Math.round(score);
    }

    /**
     * Keyword Score (0-30 points)
     * 6 points per keyword match, capped at 30
     */
    private calculateKeywordScore(text: string): { keywordScore: number; keywords: string[] } {
        const lowerText = text.toLowerCase();
        const matchedKeywords: string[] = [];

        // Find all matching keywords
        for (const keyword of VIRAL_KEYWORDS) {
            if (lowerText.includes(keyword)) {
                matchedKeywords.push(keyword);
            }
        }

        // Calculate score (6 points per keyword, max 30)
        const keywordScore = Math.min(matchedKeywords.length * 6, 30);

        return { keywordScore, keywords: matchedKeywords };
    }

    /**
     * Completeness Score (0-30 points)
     * - Starts after pause: +10
     * - Ends at pause: +10
     * - Contains complete sentences: +10
     */
    private calculateCompletenessScore(
        segments: TranscriptSegment[],
        startsAfterPause: boolean,
        endsAtPause: boolean
    ): number {
        let score = 0;

        // Bonus for natural boundaries (pauses)
        if (startsAfterPause) score += 10;
        if (endsAtPause) score += 10;

        // Check for sentence completeness
        const text = segments.map(s => s.text).join(' ');
        const hasSentenceEnding = /[.!?]$/.test(text.trim());

        if (hasSentenceEnding) {
            score += 10;
        }

        return score;
    }
}

export const clipScorer = new ClipScorer();
