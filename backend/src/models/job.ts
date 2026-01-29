// Job data model
export interface Job {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number; // 0-100
    videoPath: string;
    audioPath?: string;
    transcriptPath?: string;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

// Transcript segment structure
export interface TranscriptSegment {
    id: number;
    start: number;
    end: number;
    text: string;
}

// Transcript JSON structure
export interface Transcript {
    jobId: string;
    language: string;
    duration: number;
    segments: TranscriptSegment[];
}
