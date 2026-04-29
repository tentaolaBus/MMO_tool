/**
 * Video Clipping Feature Module
 * ================================
 * Core feature for AI-powered video clipping.
 *
 * This module encapsulates all clip-related business logic,
 * separated from UI components for maintainability and testability.
 *
 * Usage:
 *   import { clipService, scoreCalculator } from '@/features/video-clipping';
 */

export { clipService } from './services/clipService';
export { scoreCalculator } from './utils/scoreCalculator';
export type { ClipProcessingState } from './hooks/useClipProcessing';
