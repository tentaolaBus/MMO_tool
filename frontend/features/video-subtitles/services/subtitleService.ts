/**
 * Subtitle Service — API layer for standalone subtitle operations.
 * Now uses async queue-based flow: upload → get jobId → poll for results.
 */

import {
    uploadForSubtitlesAsync,
    getSubtitleJobStatus,
    subscribeToProgress,
    extractAxiosError,
} from '@/lib/api';
import type { SubtitleStyle } from '@/lib/types';
import type { SubtitleSegment } from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const subtitleService = {
    /**
     * Upload a video for subtitle generation (async, returns jobId immediately).
     */
    async upload(file: File, onUploadProgress?: (percent: number) => void) {
        const result = await uploadForSubtitlesAsync(file, onUploadProgress);
        return result;
    },

    /**
     * Poll for subtitle job status + results.
     * Returns segments when completed.
     */
    async getJobStatus(jobId: string) {
        return getSubtitleJobStatus(jobId);
    },

    /**
     * Poll until subtitle job is complete (or fails).
     * Returns the final result with segments.
     */
    async pollUntilDone(
        jobId: string,
        onProgress?: (data: { percent: number; stage: string; message: string }) => void,
        maxAttempts = 120 // 120 × 3s = 6 min
    ): Promise<{
        segments: any[];
        duration: number;
        language: string;
    }> {
        for (let i = 0; i < maxAttempts; i++) {
            const result = await this.getJobStatus(jobId);

            if (result.progress) {
                onProgress?.(result.progress);
            }

            if (result.status === 'completed' && result.segments) {
                return {
                    segments: result.segments,
                    duration: result.duration || 0,
                    language: result.language || 'en',
                };
            }

            if (result.status === 'failed') {
                throw new Error(result.error || 'Subtitle generation failed');
            }

            // Wait 3 seconds before next poll
            await new Promise(r => setTimeout(r, 3000));
        }

        throw new Error('Subtitle generation timed out. Please try again.');
    },

    /**
     * Export video with burned-in subtitles — triggers download.
     */
    async exportVideo(jobId: string, segments: SubtitleSegment[], style: SubtitleStyle, enabled: boolean) {
        const axios = (await import('axios')).default;
        const response = await axios.post(
            `${API_BASE_URL}/subtitles/export`,
            { jobId, segments, style, enabled },
            { responseType: 'blob', timeout: 300000 }
        );

        const blob = response.data;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `subtitled_${jobId}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /** Subscribe to SSE progress */
    subscribeToProgress(
        jobId: string,
        onUpdate: (data: { percent: number; stage: string; message: string }) => void,
        onError?: (error: Event) => void
    ) {
        return subscribeToProgress(jobId, onUpdate, onError);
    },

    extractError: extractAxiosError,
};
