"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clipDetector = exports.ClipDetector = void 0;
const clipScorer_1 = require("./clipScorer");
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
/**
 * Configuration for clip detection
 */
const CLIP_CONFIG = {
    minDuration: 20, // seconds
    maxDuration: 60, // seconds
    pauseThreshold: 1.2, // seconds - gap to consider as "pause"
    minClips: 5,
    maxClips: 15
};
/**
 * ClipDetector - Analyzes transcripts and generates clip candidates.
 *
 * Supports two modes:
 *   1. AI-powered (preferred): calls /analyze-highlights for multimodal analysis
 *   2. Legacy fallback: text-only pause-based detection
 */
class ClipDetector {
    /**
     * Run multimodal highlight analysis via the AI service.
     * Falls back to legacy transcript analysis if AI service is unavailable.
     */
    async analyzeVideo(videoPath, transcript, category = 'podcast', maxClips = CLIP_CONFIG.maxClips) {
        // Try AI-powered analysis first
        try {
            const result = await this.analyzeWithAI(videoPath, transcript.jobId || '', category, maxClips);
            return result;
        }
        catch (error) {
            console.warn(`⚠️ AI highlight analysis unavailable: ${error.message}`);
            console.warn('   Falling back to legacy transcript-based detection');
            return this.analyzeTranscript(transcript, maxClips);
        }
    }
    /**
     * Call the AI service /analyze-highlights endpoint for
     * multimodal highlight extraction.
     */
    async analyzeWithAI(videoPath, jobId, category, maxClips) {
        console.log(`🧠 Requesting AI highlight analysis for job ${jobId}...`);
        const response = await axios_1.default.post(`${config_1.config.aiServiceUrl}/analyze-highlights`, {
            jobId,
            videoPath,
            category,
            maxClips,
            whisperModel: 'medium',
        }, {
            timeout: 600000, // 10 minute timeout for full analysis
        });
        if (!response.data.success) {
            throw new Error(response.data.error || 'AI analysis returned unsuccessful');
        }
        console.log(`🧠 AI analysis complete: ${response.data.total} highlights found`);
        console.log(`   Duration: ${response.data.metadata.processing_time_seconds}s`);
        console.log(`   Category: ${response.data.metadata.category}`);
        console.log(`   Language: ${response.data.metadata.language}`);
        // Convert AI highlights to ClipCandidate format
        const candidates = response.data.highlights.map((highlight) => ({
            startTime: highlight.start,
            endTime: highlight.end,
            duration: highlight.duration,
            segments: [], // AI analysis doesn't return per-segment data
            text: highlight.text || '',
            score: clipScorer_1.clipScorer.fromAIHighlight(highlight),
        }));
        return {
            jobId,
            candidates,
            selectedCount: candidates.length,
        };
    }
    /**
     * LEGACY: Analyze transcript and generate clip candidates
     * (text-only, pause-based detection)
     */
    analyzeTranscript(transcript, maxClips = CLIP_CONFIG.maxClips) {
        const { segments } = transcript;
        if (!segments || segments.length === 0) {
            return {
                jobId: transcript.jobId || '',
                candidates: [],
                selectedCount: 0
            };
        }
        // Step 1: Detect pause breakpoints
        const breakpoints = this.detectPauseBreakpoints(segments);
        // Step 2: Generate candidate clips
        const candidates = this.generateCandidates(segments, breakpoints);
        // Step 3: Score all candidates
        const scoredCandidates = candidates.map(candidate => {
            const score = clipScorer_1.clipScorer.scoreClip(candidate.segments, candidate.startTime, candidate.endTime, candidate.startsAfterPause, candidate.endsAtPause);
            return {
                ...candidate,
                score
            };
        });
        // Step 4: Select top clips (sorted by score, no overlaps)
        const selectedClips = this.selectTopClips(scoredCandidates, maxClips);
        return {
            jobId: transcript.jobId || '',
            candidates: selectedClips,
            selectedCount: selectedClips.length
        };
    }
    /**
     * Detect pauses (gaps >= pauseThreshold) between segments
     * Returns array of timestamps where pauses occur
     */
    detectPauseBreakpoints(segments) {
        const breakpoints = [];
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
    generateCandidates(segments, breakpoints) {
        const candidates = [];
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
                const hitBreakpoint = breakpoints.some(bp => Math.abs(bp - endTime) < 0.1 // tolerance for floating point
                );
                endIdx++;
                // If we hit a breakpoint and have enough duration, create candidate
                if (hitBreakpoint && duration >= CLIP_CONFIG.minDuration) {
                    const clipSegments = segments.slice(startIdx, endIdx);
                    const text = clipSegments.map(s => s.text).join(' ');
                    // Check if starts after pause
                    const startsAfterPause = breakpoints.some(bp => Math.abs(bp - startTime) < 0.1) || startIdx === 0;
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
                const startsAfterPause = breakpoints.some(bp => Math.abs(bp - startTime) < 0.1) || startIdx === 0;
                const endsAtPause = breakpoints.some(bp => Math.abs(bp - endTime) < 0.1);
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
    selectTopClips(candidates, maxClips) {
        // Sort by score descending
        const sorted = [...candidates].sort((a, b) => b.score.total - a.score.total);
        const selected = [];
        for (const candidate of sorted) {
            // Check if this clip overlaps with any already selected
            const hasOverlap = selected.some(selected => this.clipsOverlap(candidate, selected));
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
    clipsOverlap(clip1, clip2) {
        return ((clip1.startTime >= clip2.startTime && clip1.startTime < clip2.endTime) ||
            (clip1.endTime > clip2.startTime && clip1.endTime <= clip2.endTime) ||
            (clip1.startTime <= clip2.startTime && clip1.endTime >= clip2.endTime));
    }
}
exports.ClipDetector = ClipDetector;
exports.clipDetector = new ClipDetector();
