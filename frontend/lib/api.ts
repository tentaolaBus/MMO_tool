import axios from 'axios';
import { SubtitleSegment, SubtitleResponse, SubtitleStyle } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
});

/**
 * Extract a human-readable error message from any Axios error.
 * Handles: network errors, timeouts, HTTP error responses, and unknown errors.
 */
export function extractAxiosError(error: any): {
    message: string;
    status?: number;
    stage?: string;
    hint?: string;
    rawData?: any;
} {
    // Network error (server down, CORS, etc.)
    if (error.code === 'ERR_NETWORK') {
        return {
            message: 'Cannot connect to server. Please check if the backend is running.',
        };
    }

    // Timeout
    if (error.code === 'ECONNABORTED') {
        return {
            message: 'Request timed out. The operation took too long.',
        };
    }

    // HTTP error with response body
    if (error.response?.data) {
        const data = error.response.data;
        return {
            message: data.message || data.error || `Server error (${error.response.status})`,
            status: error.response.status,
            stage: data.stage,
            hint: data.hint,
            rawData: data,
        };
    }

    // HTTP error without body
    if (error.response) {
        return {
            message: `Server returned ${error.response.status}: ${error.response.statusText}`,
            status: error.response.status,
        };
    }

    // Non-Axios error
    return {
        message: error.message || 'An unknown error occurred',
    };
}

/**
 * Subscribe to real-time progress updates via SSE.
 * Returns an unsubscribe function.
 */
export function subscribeToProgress(
    jobId: string,
    onUpdate: (data: { percent: number; stage: string; message: string }) => void,
    onError?: (error: Event) => void
): () => void {
    const baseUrl = API_BASE_URL.replace('/api', '');
    const url = `${baseUrl}/api/jobs/${jobId}/progress/stream`;
    const eventSource = new EventSource(url);

    // Stall detection: if no update for 60s, fire error
    let lastUpdateTime = Date.now();
    const stallCheckInterval = setInterval(() => {
        if (Date.now() - lastUpdateTime > 60000) {
            console.warn('SSE stall detected (60s no updates), closing...');
            clearInterval(stallCheckInterval);
            eventSource.close();
            onError?.(new Event('stall'));
        }
    }, 10000);

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            lastUpdateTime = Date.now();
            onUpdate(data);

            // Auto-close on terminal states
            if (data.stage === 'completed' || data.stage === 'failed') {
                clearInterval(stallCheckInterval);
                eventSource.close();
            }
        } catch (e) {
            console.error('Failed to parse SSE data:', e);
        }
    };

    eventSource.onerror = (event) => {
        console.error('SSE connection error:', event);
        clearInterval(stallCheckInterval);
        onError?.(event);
        eventSource.close();
    };

    return () => {
        clearInterval(stallCheckInterval);
        eventSource.close();
    };
}

/** Mirrors backend `JobProgress` from models/job.ts — keep in sync. */
export interface JobProgress {
    percent: number;   // 0-100
    stage: string;     // 'uploading' | 'analyzing' | 'transcribing' | 'completed' | 'failed' | …
    message: string;
}

export interface Job {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    /** Legacy 0-100 percent. Always a number — backend coerces server-side. */
    progress: number;
    /** Rich progress payload, populated by GET /api/jobs/:id. Optional for back-compat. */
    progressDetail?: JobProgress;
    videoPath: string;
    audioPath?: string;
    transcriptPath?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
}

export interface TranscriptSegment {
    id: number;
    start: number;
    end: number;
    text: string;
}

export interface Transcript {
    jobId: string;
    language: string;
    duration: number;
    segments: TranscriptSegment[];
}

/**
 * Upload a video file.
 *
 * IMPORTANT: Do NOT set Content-Type manually — Axios must set it
 * automatically so the multipart boundary and Content-Length are correct.
 * Without Content-Length, onUploadProgress.total will be undefined → 0% forever.
 */
export async function uploadVideo(
    file: File,
    onUploadProgress?: (percent: number) => void
): Promise<{ success: boolean; jobId?: string; message?: string }> {
    const formData = new FormData();
    formData.append('video', file);

    const endpoint = `${API_BASE_URL}/upload`;
    console.log('📤 Uploading file to:', endpoint);
    console.log('   File:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    try {
        const response = await axios.post(endpoint, formData, {
            // DO NOT set Content-Type manually — Axios handles multipart boundary
            onUploadProgress: (progressEvent) => {
                const total = progressEvent.total || file.size;
                if (total > 0) {
                    const percent = Math.round((progressEvent.loaded * 100) / total);
                    console.log(`   📊 Upload progress: ${progressEvent.loaded}/${total} (${percent}%)`);
                    onUploadProgress?.(percent);
                } else {
                    // total unknown — send -1 to signal indeterminate
                    console.log(`   📊 Upload progress: ${progressEvent.loaded} bytes (total unknown)`);
                    onUploadProgress?.(-1);
                }
            },
        });

        console.log('✅ Upload response:', response.data);
        return response.data;
    } catch (error: any) {
        console.error('❌ Upload error:', error);

        // Handle network errors (server not running, etc.)
        if (error.code === 'ERR_NETWORK') {
            throw new Error('Cannot connect to server. Please check if the backend is running on port 3001.');
        }

        // Handle timeout errors
        if (error.code === 'ECONNABORTED') {
            throw new Error('Upload timed out. Please try again with a smaller file.');
        }

        // Handle server errors with response
        if (error.response?.data?.message) {
            throw new Error(error.response.data.message);
        }

        // Generic fallback
        throw new Error(error.message || 'Failed to upload video');
    }
}

/**
 * Upload a video from YouTube URL
 */
export async function uploadYoutubeVideo(url: string): Promise<{ success: boolean; jobId?: string; message?: string }> {
    const endpoint = `${API_BASE_URL}/upload/youtube`;
    console.log('📺 Downloading YouTube video:', url);
    console.log('   Endpoint:', endpoint);

    try {
        const response = await axios.post(endpoint, { url });
        console.log('✅ YouTube response:', response.data);
        return response.data;
    } catch (error: any) {
        console.error('❌ YouTube upload error:', error);

        // Handle network errors (server not running, etc.)
        if (error.code === 'ERR_NETWORK') {
            throw new Error('Cannot connect to server. Please check if the backend is running on port 3001.');
        }

        // Handle timeout errors (YouTube downloads can be slow)
        if (error.code === 'ECONNABORTED') {
            throw new Error('Download timed out. The YouTube video may be too long.');
        }

        // Handle server errors with response
        if (error.response?.data?.message) {
            throw new Error(error.response.data.message);
        }

        // Generic fallback
        throw new Error(error.message || 'Failed to download YouTube video');
    }
}

/**
 * Poll job status until completion or failure
 */
export async function pollJobStatus(
    jobId: string,
    onUpdate: (job: Job) => void,
    intervalMs: number = 2000
): Promise<Job> {
    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            try {
                const job = await getJobStatus(jobId);
                onUpdate(job);

                if (job.status === 'completed' || job.status === 'failed') {
                    clearInterval(interval);
                    resolve(job);
                }
            } catch (error) {
                console.error('Error polling job status:', error);
            }
        }, intervalMs);
    });
}

/**
 * Render clips for a job.
 * Automatically retries when backend returns 202 (transcription still in progress).
 */
export async function renderClips(
    jobId: string,
    maxClips: number = 10,
    onProgress?: (status: string, progress: number) => void
): Promise<{
    success: boolean;
    jobId: string;
    clips: any[];
    count: number;
}> {
    const MAX_RETRIES = 90; // 90 × 5 s ≈ 7.5 min max wait

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await axios.post(`${API_BASE_URL}/clips/render`, {
                jobId,
                maxClips
            });

            // 202 = transcription still in progress — wait and retry
            if (response.status === 202) {
                const waitMs = response.data?.retryAfterMs || 5000;
                const pct = response.data?.progress || 0;
                console.log(`⏳ Transcription in progress (${pct}%), retry ${attempt + 1}/${MAX_RETRIES}...`);
                onProgress?.(response.data?.status || 'processing', pct);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }

            return response.data;
        } catch (err: any) {
            // 422 = job failed permanently — don't retry
            if (err.response?.status === 422) {
                const msg = err.response?.data?.message || 'Transcription failed';
                console.error('Transcription failed permanently:', msg);
                throw new Error(msg);
            }

            // Extract full error details for debugging
            const extracted = extractAxiosError(err);
            console.error('FRONTEND_RENDER_ERROR FULL:', {
                ...extracted,
                axiosCode: err.code,
                axiosMessage: err.message,
                requestUrl: err.config?.url,
                requestData: err.config?.data,
            });

            // Create a descriptive error message with stage/hint info
            let errorMsg = extracted.message;
            if (extracted.stage) errorMsg = `[${extracted.stage}] ${errorMsg}`;
            if (extracted.hint) errorMsg += ` Hint: ${extracted.hint}`;

            throw new Error(errorMsg);
        }
    }

    throw new Error('Transcription timed out. Please try re-uploading the video.');
}

/**
 * Get subtitles for a clip
 */
export async function getSubtitles(clipId: string, language: string = 'en'): Promise<SubtitleResponse> {
    const response = await apiClient.get(`/clips/${clipId}/subtitles`, {
        params: { lang: language },
    });
    return response.data;
}

/**
 * Update edited subtitles for a clip
 */
export async function updateSubtitles(
    clipId: string,
    language: string,
    segments: SubtitleSegment[]
): Promise<SubtitleResponse> {
    const response = await apiClient.put(`/clips/${clipId}/subtitles`, {
        language,
        segments,
    });
    return response.data;
}

/**
 * Get clips for a job from database
 */
export async function getClips(jobId: string): Promise<{
    success: boolean;
    clips: any[];
    count: number;
}> {
    const response = await apiClient.get(`/clips/${jobId}`);
    return response.data;
}

/**
 * Update clip selection
 */
export async function updateClipSelection(clipId: string, selected: boolean): Promise<{
    success: boolean;
    clipId: string;
    selected: boolean;
}> {
    const response = await apiClient.put(`/clips/${clipId}/select`, { selected });
    return response.data;
}

/**
 * Render final video with styled subtitles
 */
export async function renderFinalVideo(
    clipId: string,
    language: string = 'en',
    style?: SubtitleStyle,
    enabled: boolean = true
): Promise<{
    success: boolean;
    clipId: string;
    finalVideoUrl: string;
    renderTime: number;
}> {
    const response = await apiClient.post(`/clips/${clipId}/render-final`, {
        language,
        style,
        enabled,
    });
    return response.data;
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<Job> {
    const response = await axios.get(`${API_BASE_URL}/jobs/${jobId}`);
    return response.data;
}

/**
 * Get transcript data
 */
export async function getTranscript(transcriptPath: string): Promise<Transcript> {
    // In production, this would fetch from a proper URL
    // For now, we'll need to serve the transcript files
    const response = await axios.get(transcriptPath);
    return response.data;
}

/**
 * Download a single clip
 */
export function downloadClip(clipId: string): void {
    window.open(`${API_BASE_URL}/clips/${clipId}/download`, '_blank');
}

/**
 * Download multiple clips as a ZIP archive
 */
export async function downloadClipsZip(clipIds: string[]): Promise<Blob> {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/clips/download-zip`,
            { clipIds },
            { responseType: 'blob' }
        );
        return response.data;
    } catch (err: any) {
        const extracted = extractAxiosError(err);
        console.error('ZIP download failed:', extracted);
        throw new Error(extracted.message);
    }
}

/**
 * Download selected clips — single file for 1 clip, ZIP for 2+.
 * Returns a promise that resolves when the download is triggered.
 */
export async function downloadSelectedClips(clipIds: string[]): Promise<void> {
    if (clipIds.length === 0) return;

    if (clipIds.length === 1) {
        const response = await axios.get(`${API_BASE_URL}/clips/${clipIds[0]}/download`, {
            responseType: 'blob',
        });
        const blob = response.data;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clip_${clipIds[0]}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
    }

    const blob = await downloadClipsZip(clipIds);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clips_${clipIds.length}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Delete all files and database records for a job (cleanup after download).
 */
export async function cleanupJob(jobId: string): Promise<void> {
    await axios.delete(`${API_BASE_URL}/jobs/${jobId}/cleanup`);
}

// ═══════════════════════════════════════════════════
//  Video Reframing APIs
// ═══════════════════════════════════════════════════

/**
 * Upload a video for reframing with crop/ratio settings.
 *
 * IMPORTANT: Do NOT set Content-Type manually.
 */
export async function uploadForReframe(
    file: File,
    settings: { ratio: string; cropX: number; autoCenter: boolean },
    onUploadProgress?: (percent: number) => void
): Promise<{ success: boolean; jobId: string; message: string; meta?: any }> {
    const formData = new FormData();
    formData.append('video', file);
    formData.append('ratio', settings.ratio);
    formData.append('cropX', String(settings.cropX));
    formData.append('autoCenter', String(settings.autoCenter));

    const endpoint = `${API_BASE_URL}/reframe/upload`;
    console.log('📐 Uploading for reframe:', endpoint);
    console.log('   File:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log('   Settings:', JSON.stringify(settings));

    try {
        const response = await axios.post(endpoint, formData, {
            // DO NOT set Content-Type manually
            onUploadProgress: (progressEvent) => {
                const total = progressEvent.total || file.size;
                if (total > 0) {
                    const percent = Math.round((progressEvent.loaded * 100) / total);
                    console.log(`   📊 Reframe upload progress: ${percent}%`);
                    onUploadProgress?.(percent);
                } else {
                    onUploadProgress?.(-1);
                }
            },
        });
        console.log('✅ Reframe upload response:', response.data);
        return response.data;
    } catch (error: any) {
        console.error('❌ Reframe upload error:', error);

        if (error.code === 'ERR_NETWORK') {
            throw new Error('Cannot connect to server. Please check if the backend is running.');
        }
        if (error.code === 'ECONNABORTED') {
            throw new Error('Upload timed out. Please try again with a smaller file.');
        }
        if (error.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error(error.message || 'Failed to upload video for reframing');
    }
}

/**
 * Get the status of a reframe job.
 */
export async function getReframeJobStatus(jobId: string): Promise<{
    success: boolean;
    jobId: string;
    status: string;
    progress: { percent: number; stage: string; message: string };
    hasOutput: boolean;
}> {
    const response = await axios.get(`${API_BASE_URL}/reframe/jobs/${jobId}`);
    return response.data;
}

/**
 * Download the reframed video output.
 */
export async function downloadReframedVideo(jobId: string): Promise<void> {
    const response = await axios.get(`${API_BASE_URL}/reframe/jobs/${jobId}/download`, {
        responseType: 'blob',
    });

    const blob = response.data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reframed_${jobId}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════
//  Standalone Subtitle APIs
// ═══════════════════════════════════════════════════

/**
 * Upload a video for standalone subtitle generation (async queue-based).
 * Returns jobId immediately — poll for status.
 *
 * IMPORTANT: Do NOT set Content-Type manually.
 */
export async function uploadForSubtitlesAsync(
    file: File,
    onUploadProgress?: (percent: number) => void
): Promise<{ success: boolean; jobId: string; message?: string }> {
    const formData = new FormData();
    formData.append('video', file);

    const endpoint = `${API_BASE_URL}/subtitles/upload`;
    console.log('📝 Uploading for subtitles (async):', endpoint);

    try {
        const response = await axios.post(endpoint, formData, {
            // DO NOT set Content-Type manually
            timeout: 120000, // 2 min for upload itself
            onUploadProgress: (progressEvent) => {
                const total = progressEvent.total || file.size;
                if (total > 0) {
                    const percent = Math.round((progressEvent.loaded * 100) / total);
                    console.log(`   📊 Subtitle upload progress: ${percent}%`);
                    onUploadProgress?.(percent);
                } else {
                    onUploadProgress?.(-1);
                }
            },
        });
        console.log('✅ Subtitle upload response:', response.data);
        return response.data;
    } catch (error: any) {
        console.error('❌ Subtitle upload error:', error);
        if (error.code === 'ERR_NETWORK') {
            throw new Error('Cannot connect to server. Please check if the backend is running.');
        }
        if (error.code === 'ECONNABORTED') {
            throw new Error('Upload timed out. Try a shorter video.');
        }
        if (error.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error(error.message || 'Failed to upload video for subtitles');
    }
}

/**
 * Get subtitle job status and results (for queue-based flow).
 */
export async function getSubtitleJobStatus(jobId: string): Promise<{
    success: boolean;
    jobId: string;
    status: string;
    progress: { percent: number; stage: string; message: string };
    segments?: any[];
    duration?: number;
    language?: string;
    error?: string;
}> {
    const response = await axios.get(`${API_BASE_URL}/subtitles/jobs/${jobId}`);
    return response.data;
}

