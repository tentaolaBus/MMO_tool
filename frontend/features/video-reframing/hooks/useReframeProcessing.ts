/**
 * useReframeProcessing — React hook for the video reframing lifecycle.
 *
 * Manages: file selection → upload → progress tracking → completion → download.
 *
 * Usage:
 *   const { uploadAndProcess, progress, status, ... } = useReframeProcessing();
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { reframeService } from '../services/reframeService';
import type { ReframeSettings, VideoMeta, ReframeProgress, OutputRatio } from '../types';

export interface ReframeState {
    /** Currently selected file */
    file: File | null;
    /** Local object URL for video preview */
    previewUrl: string | null;
    /** Video metadata after probe */
    meta: VideoMeta | null;
    /** Current reframe settings */
    settings: ReframeSettings;
    /** Active job ID */
    jobId: string | null;
    /** Processing progress info */
    progress: ReframeProgress | null;
    /** Current status: idle, uploading, processing, completed, failed */
    status: 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';
    /** Error message if failed */
    error: string | null;
    /** Whether download is available */
    downloadReady: boolean;
}

export function useReframeProcessing() {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [meta, setMeta] = useState<VideoMeta | null>(null);
    const [settings, setSettings] = useState<ReframeSettings>({
        ratio: '9:16',
        cropX: 0.5,
        autoCenter: true,
    });
    const [jobId, setJobId] = useState<string | null>(null);
    const [progress, setProgress] = useState<ReframeProgress | null>(null);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'failed'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [downloadReady, setDownloadReady] = useState(false);

    const mountedRef = useRef(true);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
            }
            // Clean up preview URL
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, []);

    /** Select a file and create local preview */
    const selectFile = useCallback((newFile: File) => {
        // Clean up old preview
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }

        setFile(newFile);
        setPreviewUrl(URL.createObjectURL(newFile));
        setMeta(null); // Will be probed on upload
        setStatus('idle');
        setError(null);
        setProgress(null);
        setJobId(null);
        setDownloadReady(false);
    }, [previewUrl]);

    /** Update a single setting */
    const updateSetting = useCallback(<K extends keyof ReframeSettings>(
        key: K,
        value: ReframeSettings[K]
    ) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    }, []);

    /** Update ratio */
    const setRatio = useCallback((ratio: OutputRatio) => {
        setSettings(prev => ({ ...prev, ratio }));
    }, []);

    /** Toggle auto center */
    const toggleAutoCenter = useCallback(() => {
        setSettings(prev => ({
            ...prev,
            autoCenter: !prev.autoCenter,
            cropX: !prev.autoCenter ? 0.5 : prev.cropX,
        }));
    }, []);

    /** Set manual crop X position */
    const setCropX = useCallback((cropX: number) => {
        setSettings(prev => ({
            ...prev,
            cropX: Math.max(0, Math.min(1, cropX)),
            autoCenter: false,
        }));
    }, []);

    /** Upload and start processing */
    const uploadAndProcess = useCallback(async () => {
        if (!file) {
            setError('Please select a video file');
            return;
        }

        try {
            // Upload phase
            setStatus('uploading');
            setError(null);
            setProgress({ percent: 0, stage: 'uploading', message: 'Uploading video...' });

            const result = await reframeService.upload(file, settings, (uploadPercent) => {
                if (!mountedRef.current) return;
                if (uploadPercent < 0) {
                    // Indeterminate — total unknown
                    setProgress({ percent: 2, stage: 'uploading', message: 'Uploading...' });
                } else {
                    setProgress({ percent: Math.round(uploadPercent * 0.1), stage: 'uploading', message: `Uploading... ${uploadPercent}%` });
                }
            });

            if (!mountedRef.current) return;

            if (!result.success || !result.jobId) {
                setError(result.message || 'Upload failed');
                setStatus('failed');
                return;
            }

            // Store metadata from probe
            if (result.meta) {
                setMeta(result.meta);
            }

            const newJobId = result.jobId;
            setJobId(newJobId);
            setStatus('processing');
            setProgress({ percent: 10, stage: 'processing', message: 'Processing video...' });

            // Subscribe to SSE progress
            const unsubscribe = reframeService.subscribeToProgress(
                newJobId,
                (data) => {
                    if (!mountedRef.current) return;

                    setProgress(data);

                    if (data.stage === 'completed') {
                        setStatus('completed');
                        setDownloadReady(true);
                    }

                    if (data.stage === 'failed') {
                        setError(data.message || 'Reframing failed');
                        setStatus('failed');
                    }
                },
                () => {
                    // SSE error — fall back to polling
                    console.warn('SSE connection lost for reframe job, starting poll...');
                    pollStatus(newJobId);
                }
            );

            unsubscribeRef.current = unsubscribe;
        } catch (err: any) {
            if (!mountedRef.current) return;
            const extracted = reframeService.extractError(err);
            setError(extracted.message);
            setStatus('failed');
            setProgress(null);
        }
    }, [file, settings]);

    /** Fallback polling if SSE fails */
    const pollStatus = useCallback(async (pollJobId: string) => {
        const maxAttempts = 120; // 120 × 3s = 6 min max

        for (let i = 0; i < maxAttempts; i++) {
            if (!mountedRef.current) return;

            try {
                const statusResult = await reframeService.getStatus(pollJobId);

                if (!mountedRef.current) return;

                setProgress(statusResult.progress);

                if (statusResult.progress.stage === 'completed' || statusResult.hasOutput) {
                    setStatus('completed');
                    setDownloadReady(true);
                    return;
                }

                if (statusResult.progress.stage === 'failed') {
                    setError(statusResult.progress.message || 'Reframing failed');
                    setStatus('failed');
                    return;
                }
            } catch {
                console.warn('Poll attempt failed, retrying...');
            }

            await new Promise(r => setTimeout(r, 3000));
        }

        setError('Processing timed out. Please try again.');
        setStatus('failed');
    }, []);

    /** Download the reframed video */
    const download = useCallback(async () => {
        if (!jobId) return;

        try {
            await reframeService.download(jobId);
        } catch (err: any) {
            const extracted = reframeService.extractError(err);
            setError(extracted.message);
        }
    }, [jobId]);

    /** Reset to initial state */
    const reset = useCallback(() => {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }

        setFile(null);
        setPreviewUrl(null);
        setMeta(null);
        setSettings({ ratio: '9:16', cropX: 0.5, autoCenter: true });
        setJobId(null);
        setProgress(null);
        setStatus('idle');
        setError(null);
        setDownloadReady(false);
    }, [previewUrl]);

    return {
        // State
        file,
        previewUrl,
        meta,
        settings,
        jobId,
        progress,
        status,
        error,
        downloadReady,

        // Actions
        selectFile,
        updateSetting,
        setRatio,
        toggleAutoCenter,
        setCropX,
        uploadAndProcess,
        download,
        reset,
        setError,
    };
}
