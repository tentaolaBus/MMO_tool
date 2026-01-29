import { Transcript, TranscriptSegment } from '../models/job';
import { ClipCandidate } from '../models/clip';
import { clipScorer } from './clipScorer';

/**
 * Configuration for clip detection
 */
const CLIP_CONFIG = {
    minDuration: 20,      // seconds
    maxDuration: 60,      // seconds
    pauseThreshold: 1.2,  // seconds - gap to consider as "pause"
    minClips: 5,
    maxClips: 15
};

/**
 * ClipDetector - Analyzes transcripts and generates clip candidates
 */
export class ClipDetector {
    /**
     * Analyze transcript and generate clip candidates
     */
    analyzeTranscript(transcript: Transcript, maxClips: number = CLIP_CONFIG.maxClips): ClipCandidate[] {
        const { segments } = transcript;

        if (!segments || segments.length === 0) {
            return [];
        }

        // Step 1: Detect pause breakpoints
        const breakpoints = this.detectPauseBreakpoints(segments);

        // Step 2: Generate candidate clips
        const candidates = this.generateCandidates(segments, breakpoints);

        // Step 3: Score all candidates
        const scoredCandidates = candidates.map(candidate => {
            const score = clipScorer.scoreClip(
                candidate.segments,
                candidate.startTime,
                candidate.endTime,
                candidate.startsAfterPause,
                candidate.endsAtPause
            );

            return {
                ...candidate,
                score
            };
        });

        // Step 4: Select top clips (sorted by score, no overlaps)
        const selectedClips = this.selectTopClips(scoredCandidates, maxClips);

        return selectedClips;
    }

    /**
     * Detect pauses (gaps >= pauseThreshold) between segments
     * Returns array of timestamps where pauses occur
     */
    private detectPauseBreakpoints(segments: TranscriptSegment[]): number[] {
        const breakpoints: number[] = [];

        for (let i = 0; i < segments.length - 1; i++) {
            const gap = segments[i + 1].start - segments[i].end;

            if (gap >= CLIP_CONFIG.pauseThreshold) {
                breakpoints.push(segments[i].end);
            }
        }

        return breakpoints;
    }

    /**
     * Generate candidate clips by grouping segments
     */
    private generateCandidates(
        segments: TranscriptSegment[],
        breakpoints: number[]
    ): Array<ClipCandidate & { startsAfterPause: boolean; endsAtPause: boolean }> {
        const candidates: Array<ClipCandidate & { startsAfterPause: boolean; endsAtPause: boolean }> = [];

        let startIdx = 0;

        while (startIdx < segments.length) {
            const startTime = segments[startIdx].start;
            let endIdx = startIdx;
            let duration = 0;

            // Group segments until we hit max duration or a breakpoint
            while (endIdx < segments.length) {
                const endTime = segments[endIdx].end;
                duration = endTime - startTime;

                // Stop if we exceed max duration
                if (duration > CLIP_CONFIG.maxDuration) {
                    break;
                }

                // Check if we hit a breakpoint
                const hitBreakpoint = breakpoints.some(bp =>
                    Math.abs(bp - endTime) < 0.1 // tolerance for floating point
                );

                endIdx++;

                // If we hit a breakpoint and have enough duration, create candidate
                if (hitBreakpoint && duration >= CLIP_CONFIG.minDuration) {
                    const clipSegments = segments.slice(startIdx, endIdx);
                    const text = clipSegments.map(s => s.text).join(' ');

                    // Check if starts after pause
                    const startsAfterPause = breakpoints.some(bp =>
                        Math.abs(bp - startTime) < 0.1
                    ) || startIdx === 0;

                    candidates.push({
                        startTime,
                        endTime: segments[endIdx - 1].end,
                        duration,
                        segments: clipSegments,
                        text,
                        score: { total: 0, durationScore: 0, keywordScore: 0, completenessScore: 0, keywords: [] },
                        startsAfterPause,
                        endsAtPause: true
                    });

                    break;
                }
            }

            // If we reached min duration without hitting breakpoint, create anyway
            if (endIdx > startIdx && duration >= CLIP_CONFIG.minDuration) {
                const clipSegments = segments.slice(startIdx, endIdx);
                const text = clipSegments.map(s => s.text).join(' ');
                const endTime = segments[endIdx - 1].end;

                const startsAfterPause = breakpoints.some(bp =>
                    Math.abs(bp - startTime) < 0.1
                ) || startIdx === 0;

                const endsAtPause = breakpoints.some(bp =>
                    Math.abs(bp - endTime) < 0.1
                );

                candidates.push({
                    startTime,
                    endTime,
                    duration,
                    segments: clipSegments,
                    text,
                    score: { total: 0, durationScore: 0, keywordScore: 0, completenessScore: 0, keywords: [] },
                    startsAfterPause,
                    endsAtPause
                });
            }

            // Move to next potential start point
            startIdx = Math.max(startIdx + 1, endIdx);
        }

        return candidates;
    }

    /**
     * Select top N clips, ensuring no overlaps
     */
    private selectTopClips(candidates: ClipCandidate[], maxClips: number): ClipCandidate[] {
        // Sort by score descending
        const sorted = [...candidates].sort((a, b) => b.score.total - a.score.total);

        const selected: ClipCandidate[] = [];

        for (const candidate of sorted) {
            // Check if this clip overlaps with any already selected
            const hasOverlap = selected.some(selected =>
                this.clipsOverlap(candidate, selected)
            );

            if (!hasOverlap) {
                selected.push(candidate);
            }

            // Stop when we have enough clips
            if (selected.length >= maxClips) {
                break;
            }
        }

        // Return clips sorted by start time
        return selected.sort((a, b) => a.startTime - b.startTime);
    }

    /**
     * Check if two clips overlap in time
     */
    private clipsOverlap(clip1: ClipCandidate, clip2: ClipCandidate): boolean {
        return (
            (clip1.startTime >= clip2.startTime && clip1.startTime < clip2.endTime) ||
            (clip1.endTime > clip2.startTime && clip1.endTime <= clip2.endTime) ||
            (clip1.startTime <= clip2.startTime && clip1.endTime >= clip2.endTime)
        );
    }
}

export const clipDetector = new ClipDetector();
