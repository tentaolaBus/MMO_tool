/**
 * Reframe Service — API layer for video reframing operations.
 *
 * Feature-scoped interface that wraps the central api.ts client.
 * This is the ONLY place that knows about reframe API endpoints.
 */

import {
    uploadForReframe as apiUpload,
    getReframeJobStatus as apiGetStatus,
    downloadReframedVideo as apiDownload,
    subscribeToProgress,
    extractAxiosError,
} from '@/lib/api';
import type { ReframeSettings, ReframeJobResponse, ReframeJobStatus, ReframeProgress } from '../types';

export const reframeService = {
    /**
     * Upload a video file and queue it for reframing.
     */
    async upload(file: File, settings: ReframeSettings, onUploadProgress?: (percent: number) => void): Promise<ReframeJobResponse> {
        return apiUpload(file, settings, onUploadProgress);
    },

    /**
     * Get the status of a reframe job.
     */
    async getStatus(jobId: string): Promise<ReframeJobStatus> {
        return apiGetStatus(jobId);
    },

    /**
     * Download the reframed video.
     */
    async download(jobId: string): Promise<void> {
        return apiDownload(jobId);
    },

    /**
     * Subscribe to real-time progress via SSE.
     * Returns unsubscribe function.
     */
    subscribeToProgress(
        jobId: string,
        onUpdate: (data: ReframeProgress) => void,
        onError?: (error: Event) => void
    ): () => void {
        return subscribeToProgress(jobId, onUpdate, onError);
    },

    /**
     * Extract a human-readable error from any Axios error.
     */
    extractError: extractAxiosError,
};
