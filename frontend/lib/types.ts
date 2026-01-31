export interface ClipScore {
    total: number;
    durationScore: number;
    keywordScore: number;
    completenessScore: number;
    keywords: string[];
}

export interface Clip {
    id: string;
    jobId: string;
    clipIndex: number;
    videoUrl: string;
    filename: string;
    startTime?: number;
    endTime?: number;
    duration?: number;
    text?: string;
    score?: ClipScore;
    size?: number;
    selected?: boolean;
    createdAt: string;
}

export interface ClipsResponse {
    success: boolean;
    jobId: string;
    clips: Clip[];
    count: number;
}

export interface SubtitleSegment {
    start: number;
    end: number;
    text: string;
}

export interface SubtitleResponse {
    success: boolean;
    clipId: string;
    jobId: string;
    language: string;
    segments: SubtitleSegment[];
    cached?: boolean;
}
