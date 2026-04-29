/**
 * Video Subtitles — Type definitions.
 */

import type { SubtitleStyle } from '@/lib/types';

/** A single subtitle segment with timing */
export interface SubtitleSegment {
    id: string;
    start: number;
    end: number;
    text: string;
}

/** Subtitle generation response from backend */
export interface SubtitleGenerationResponse {
    success: boolean;
    jobId: string;
    segments: SubtitleSegment[];
    duration: number;
    language: string;
}

/** Subtitle processing status */
export type SubtitleStatus = 'idle' | 'uploading' | 'generating' | 'ready' | 'exporting' | 'exported' | 'failed';

/** Re-export SubtitleStyle from shared types */
export type { SubtitleStyle } from '@/lib/types';
export { DEFAULT_SUBTITLE_STYLE } from '@/lib/types';
