/**
 * Clip-specific type definitions.
 *
 * These are re-exported from lib/types.ts for backward compatibility,
 * but feature consumers should import from here.
 */

export type { Clip, ClipScore, ClipsResponse } from '@/lib/types';

/** Result from the clip rendering pipeline */
export interface RenderResult {
    success: boolean;
    jobId: string;
    clips: import('@/lib/types').Clip[];
    count: number;
}

/** Progress update during processing */
export interface ProgressUpdate {
    percent: number;
    stage: string;
    message: string;
}
