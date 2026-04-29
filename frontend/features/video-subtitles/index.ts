/**
 * Video Subtitles Feature Module
 * ================================
 * Standalone subtitle generation, editing, and video burn-in.
 */

export { subtitleService } from './services/subtitleService';
export { useSubtitleProcessing } from './hooks/useSubtitleProcessing';
export type {
    SubtitleSegment,
    SubtitleGenerationResponse,
    SubtitleStatus,
    SubtitleStyle,
} from './types';
export { DEFAULT_SUBTITLE_STYLE } from './types';
