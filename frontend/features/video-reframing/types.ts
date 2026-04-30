/**
 * Video Reframing — Type definitions.
 */

/** Supported output aspect ratios */
export type OutputRatio = '9:16' | '1:1' | '4:5';

/** AI reframing mode */
export type AIMode = 'tracking' | 'face' | 'manual';

/** Zoom style */
export type ZoomStyle = 'smooth' | 'dynamic';

/** Reframe processing settings */
export interface ReframeSettings {
    ratio: OutputRatio;
    cropX: number;        // 0–1 fraction (0=left, 0.5=center, 1=right)
    autoCenter: boolean;  // legacy transport field (kept to avoid breaking upload API)

    // New (Opus-like) controls
    aiMode: AIMode;
    zoomStyle: ZoomStyle;
    focusSubjectId: 'auto' | string;
}

/** Video metadata from probe */
export interface VideoMeta {
    width: number;
    height: number;
    duration: number;
    codec: string;
    fps: number;
}

/** Reframe job response from backend */
export interface ReframeJobResponse {
    success: boolean;
    jobId: string;
    message: string;
    meta?: VideoMeta;
}

/** Reframe job status */
export interface ReframeJobStatus {
    success: boolean;
    jobId: string;
    status: string;
    progress: {
        percent: number;
        stage: string;
        message: string;
    };
    hasOutput: boolean;
}

/** Progress update during processing */
export interface ReframeProgress {
    percent: number;
    stage: string;
    message: string;
}

export interface ReframeCropsJson {
    meta: {
        clipId: string;
        input: string;
        width: number;
        height: number;
        fps: number;
        frames: number;
        duration: number;
        target_aspect: string;
        alpha: number;
        zoom: string;
        face_priority: boolean;
        // Optional: when backend provides it
        keyframes?: Array<{ frame: number; bbox: [number, number, number, number]; cls: string }>;
    };
    crops: Array<{ frame: number; x: number; y: number; width: number; height: number }>;
}

/** Ratio display info */
export interface RatioOption {
    value: OutputRatio;
    label: string;
    description: string;
    width: number;
    height: number;
}

/** Available ratio options */
export const RATIO_OPTIONS: RatioOption[] = [
    { value: '9:16', label: '9:16', description: 'TikTok / Reels / Shorts', width: 1080, height: 1920 },
    { value: '1:1',  label: '1:1',  description: 'Instagram Post / Square', width: 1080, height: 1080 },
    { value: '4:5',  label: '4:5',  description: 'Instagram Feed / Portrait', width: 1080, height: 1350 },
];
