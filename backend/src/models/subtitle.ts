export interface SubtitleSegment {
    start: number;      // seconds
    end: number;        // seconds
    text: string;       // subtitle text
}

export interface ClipSubtitles {
    clipId: string;
    jobId: string;
    language: string;   // 'en', 'vi', 'ja', 'ko', 'zh'
    segments: SubtitleSegment[];
    createdAt: string;
}

export interface SubtitleCache {
    clipId: string;
    language: string;
    subtitles: ClipSubtitles;
    cachedAt: string;
}
