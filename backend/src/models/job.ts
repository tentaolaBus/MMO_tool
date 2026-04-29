// Structured progress payload — what BullMQ workers now write into job.progress
// via job.updateProgress({ ... }). Mirrored on the frontend in lib/api.ts.
export interface JobProgress {
    percent: number;   // 0-100
    stage: string;     // 'uploading' | 'analyzing' | 'transcribing' | 'completed' | 'failed' | …
    message: string;
}

// Job data model
export interface Job {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;            // 0-100 — percent only (legacy contract used by Supabase + JobStatus.tsx)
    progressDetail?: JobProgress; // optional rich shape, populated by /api/jobs/:id
    videoPath: string;
    audioPath?: string;
    transcriptPath?: string;
    error?: string;
    createdAt: Date;
    updatedAt: Date;

    // ── Multimodal highlight fields ──
    category?: 'podcast' | 'sports' | 'movie';  // video category for domain-specific scoring
    analysisPath?: string;                       // path to highlights.json from AI analysis
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
