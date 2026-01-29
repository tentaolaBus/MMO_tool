import { TranscriptSegment } from './job';

/**
 * Clip Score breakdown
 */
export interface ClipScore {
    total: number;              // 0-100
    durationScore: number;      // 0-40
    keywordScore: number;       // 0-30
    completenessScore: number;  // 0-30
    keywords: string[];         // matched keywords
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
