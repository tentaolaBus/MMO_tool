import { TranscriptSegment } from './job';

/**
 * Clip Score breakdown — multimodal scoring
 */
export interface ClipScore {
    total: number;              // 0-100 composite score
    durationScore: number;      // 0-40 (legacy)
    keywordScore: number;       // 0-30 (legacy)
    completenessScore: number;  // 0-30 (legacy)
    keywords: string[];         // matched keywords

    // ── Multimodal scores (from AI highlight analysis) ──
    viralScore?: number;        // 0-100+ (score × viral bonus)
    confidence?: number;        // 0.0-1.0
    audioScore?: number;        // 0-1 (energy + emotion + events)
    visualScore?: number;       // 0-1 (motion + CLIP + scenes)
    sentimentScore?: number;    // 0-1 (sentiment variance)
    hookScore?: number;         // 0-1 (opening hook strength)
    breakdown?: Record<string, number>;  // per-feature scores
}

/**
 * Candidate clip before rendering
 */
export interface ClipCandidate {
    startTime: number;          // seconds
    endTime: number;            // seconds
    duration: number;           // seconds
    segments: TranscriptSegment[];
    text: string;               // combined text from segments
    score: ClipScore;
}

/**
 * Generated clip after rendering
 */
export interface GeneratedClip {
    id: string;                 // UUID
    jobId: string;              // Original job ID
    clipIndex: number;          // Index in the list of clips
    videoPath: string;          // Path to rendered clip file
    startTime: number;          // seconds
    endTime: number;            // seconds
    duration: number;           // seconds
    text: string;               // clip text content
    score: ClipScore;
    createdAt: Date;
}

/**
 * Clip analysis result
 */
export interface ClipAnalysisResult {
    jobId: string;
    candidates: ClipCandidate[];
    selectedCount: number;
}

/**
 * Highlight from the multimodal AI analysis pipeline.
 * Returned from the /analyze-highlights endpoint.
 */
export interface AIHighlight {
    start: number;              // seconds
    end: number;                // seconds
    duration: number;           // seconds
    score: number;              // 0-100 composite score
    viral_score: number;        // 0-100+ (with viral bonus)
    confidence: number;         // 0.0-1.0
    breakdown: Record<string, number>;  // per-feature scores
    keywords: string[];         // matched domain keywords
    text: string;               // transcript text for this clip
}

/**
 * Full response from the /analyze-highlights endpoint.
 */
export interface AIHighlightResponse {
    success: boolean;
    highlights: AIHighlight[];
    total: number;
    metadata: {
        video_duration: number;
        language: string;
        category: string;
        total_segments_analyzed: number;
        processing_time_seconds: number;
    };
    analysisPath: string;
    error?: string;
}
