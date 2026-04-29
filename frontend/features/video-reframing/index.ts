/**
 * Video Reframing Feature Module
 * ================================
 * Converts horizontal videos to vertical format for short-form platforms.
 *
 * This module encapsulates all reframe-related business logic,
 * separated from UI components for maintainability and testability.
 *
 * Usage:
 *   import { reframeService } from '@/features/video-reframing';
 *   import { useReframeProcessing } from '@/features/video-reframing';
 */

export { reframeService } from './services/reframeService';
export { useReframeProcessing } from './hooks/useReframeProcessing';
export type { ReframeState } from './hooks/useReframeProcessing';
export type {
    OutputRatio,
    ReframeSettings,
    VideoMeta,
    ReframeJobResponse,
    ReframeJobStatus,
    ReframeProgress,
    RatioOption,
} from './types';
export { RATIO_OPTIONS } from './types';
