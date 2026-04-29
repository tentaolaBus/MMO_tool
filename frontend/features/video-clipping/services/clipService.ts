/**
 * Clip Service — API layer for video clipping operations.
 *
 * Delegates to the central api.ts client but provides a clean,
 * feature-scoped interface. This is the ONLY place that knows
 * about clip-related API endpoints.
 */

import {
    renderClips as apiRenderClips,
    getClips as apiGetClips,
    updateClipSelection as apiUpdateClipSelection,
    downloadSelectedClips as apiDownloadSelectedClips,
    cleanupJob as apiCleanupJob,
    subscribeToProgress,
    extractAxiosError,
} from '@/lib/api';
import type { RenderResult, ProgressUpdate } from '../types';
import type { Clip } from '@/lib/types';

export const clipService = {
    /**
     * Render clips for a job.
     * Retries automatically when transcription is still in progress (202).
     */
    async renderClips(
        jobId: string,
        maxClips: number = 10,
        onProgress?: (status: string, progress: number) => void
    ): Promise<RenderResult> {
        return apiRenderClips(jobId, maxClips, onProgress);
    },

    /**
     * Get existing clips for a job from the database.
     */
    async getClips(jobId: string) {
        return apiGetClips(jobId);
    },

    /**
     * Toggle clip selection state (persisted to database).
     */
    async updateSelection(clipId: string, selected: boolean) {
        return apiUpdateClipSelection(clipId, selected);
    },

    /**
     * Download selected clips (single file or ZIP for multiple).
     */
    async downloadSelected(clipIds: string[]) {
        return apiDownloadSelectedClips(clipIds);
    },

    /**
     * Cleanup all job files on the server after download.
     */
    async cleanup(jobId: string) {
        return apiCleanupJob(jobId);
    },

    /**
     * Subscribe to real-time progress via SSE.
     * Returns unsubscribe function.
     */
    subscribeToProgress(
        jobId: string,
        onUpdate: (data: ProgressUpdate) => void,
        onError?: (error: Event) => void
    ): () => void {
        return subscribeToProgress(jobId, onUpdate, onError);
    },

    /**
     * Extract a human-readable error from any Axios error.
     */
    extractError: extractAxiosError,
};
