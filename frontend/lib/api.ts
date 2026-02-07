import axios from 'axios';
import { SubtitleSegment, SubtitleResponse } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
});

export interface Job {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
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
 * Upload a video file
 */
export async function uploadVideo(file: File): Promise<{ success: boolean; jobId?: string; message?: string }> {
    const formData = new FormData();
    formData.append('video', file);

    const endpoint = `${API_BASE_URL}/upload`;
    console.log('📤 Uploading file to:', endpoint);
    console.log('   File:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    try {
        const response = await axios.post(endpoint, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
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
 * Render clips for a job
 */
export async function renderClips(jobId: string, maxClips: number = 10): Promise<{
    success: boolean;
    jobId: string;
    clips: any[];
    count: number;
}> {
    const response = await axios.post(`${API_BASE_URL}/clips/render`, {
        jobId,
        maxClips
    });
    return response.data;
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
 * Render final video with subtitles
 */
export async function renderFinalVideo(
    clipId: string,
    language: string = 'en',
    useEditedSubtitles: boolean = true
): Promise<{
    success: boolean;
    clipId: string;
    finalVideoUrl: string;
    renderTime: number;
}> {
    const response = await apiClient.post(`/clips/${clipId}/render-final`, {
        language,
        useEditedSubtitles,
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
 * Download multiple clips as ZIP (requires auth token)
 */
export async function downloadClipsZip(clipIds: string[], token: string): Promise<Blob> {
    const response = await axios.post(
        `${API_BASE_URL}/clips/download-zip`,
        { clipIds },
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            responseType: 'blob',
        }
    );
    return response.data;
}

