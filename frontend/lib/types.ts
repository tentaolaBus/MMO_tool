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
    updatedAt?: string;
}

export interface ClipsResponse {
    success: boolean;
    jobId: string;
    clips: Clip[];
    count: number;
}

export interface SubtitleSegment {
    id?: string;
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

export interface SubtitleStyle {
    fontSize: number;
    fontWeight: number;
    textColor: string;
    backgroundColor: string;
    backgroundOpacity: number;
    position: 'top' | 'bottom' | 'middle';
    textShadow: boolean;
    borderRadius: number;
    padding: number;
    letterSpacing: number;
    lineHeight: number;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
    fontSize: 24,
    fontWeight: 700,
    textColor: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 0.45,
    position: 'bottom',
    textShadow: true,
    borderRadius: 6,
    padding: 8,
    letterSpacing: 0.5,
    lineHeight: 1.3,
};
