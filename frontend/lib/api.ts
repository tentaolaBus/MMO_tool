import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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

    const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
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
