/**
 * Score Calculator — Pure functions for clip scoring and ranking.
 *
 * This module contains business logic for evaluating clip quality
 * based on engagement potential. It has ZERO dependencies on React
 * or API layers, making it easy to test and reuse.
 */

import type { Clip, ClipScore } from '@/lib/types';

export const scoreCalculator = {
    /**
     * Sort clips by total score (highest first).
     */
    rankByScore(clips: Clip[]): Clip[] {
        return [...clips].sort((a, b) => {
            const scoreA = a.score?.total ?? 0;
            const scoreB = b.score?.total ?? 0;
            return scoreB - scoreA;
        });
    },

    /**
     * Get engagement tier label for a clip score.
     */
    getEngagementTier(score: number): 'viral' | 'high' | 'medium' | 'low' {
        if (score >= 80) return 'viral';
        if (score >= 60) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
    },

    /**
     * Calculate a composite engagement score (0-100) from clip metadata.
     *
     * Factors:
     * - Duration sweetspot (30-60s = highest)
     * - Keyword density
     * - Completeness (starts/ends at natural breaks)
     */
    calculateEngagementScore(clip: Clip): number {
        let score = 0;

        // Duration factor (0-40 points)
        // Sweet spot: 30-60 seconds for short-form
        const duration = clip.duration ?? 0;
        if (duration >= 30 && duration <= 60) {
            score += 40;
        } else if (duration >= 15 && duration <= 90) {
            score += 25;
        } else if (duration > 0) {
            score += 10;
        }

        // Keyword factor (0-30 points)
        const keywordCount = clip.score?.keywords?.length ?? 0;
        score += Math.min(30, keywordCount * 10);

        // Completeness factor (0-30 points)
        score += (clip.score?.completenessScore ?? 0) * 30;

        return Math.min(100, Math.round(score));
    },

    /**
     * Select the top N clips by engagement score.
     */
    selectTopClips(clips: Clip[], maxClips: number = 10): Clip[] {
        return scoreCalculator
            .rankByScore(clips)
            .slice(0, maxClips);
    },

    /**
     * Get score breakdown summary for display.
     */
    getScoreSummary(clip: Clip): {
        total: number;
        tier: string;
        factors: { label: string; value: number }[];
    } {
        const total = clip.score?.total ?? 0;
        return {
            total,
            tier: scoreCalculator.getEngagementTier(total),
            factors: [
                { label: 'Duration', value: clip.score?.durationScore ?? 0 },
                { label: 'Keywords', value: clip.score?.keywordScore ?? 0 },
                { label: 'Completeness', value: clip.score?.completenessScore ?? 0 },
            ],
        };
    },
};
