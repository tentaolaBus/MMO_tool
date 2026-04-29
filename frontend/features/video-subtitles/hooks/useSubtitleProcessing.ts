/**
 * useSubtitleProcessing — React hook for the subtitle workflow.
 *
 * Flow (async queue-based):
 *   file select → upload (get jobId) → poll/SSE for transcription → edit → style → export
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { subtitleService } from '../services/subtitleService';
import { DEFAULT_SUBTITLE_STYLE } from '@/lib/types';
import type { SubtitleSegment, SubtitleStatus, SubtitleStyle } from '../types';

function genId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useSubtitleProcessing() {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [jobId, setJobId] = useState<string | null>(null);
    const [segments, setSegments] = useState<SubtitleSegment[]>([]);
    const [style, setStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
    const [subtitleEnabled, setSubtitleEnabled] = useState(true);
    const [status, setStatus] = useState<SubtitleStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ percent: number; stage: string; message: string } | null>(null);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const mountedRef = useRef(true);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            if (unsubscribeRef.current) unsubscribeRef.current();
        };
    }, []);

    /** Select a video file */
    const selectFile = useCallback((f: File) => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setFile(f);
        setPreviewUrl(URL.createObjectURL(f));
        setSegments([]);
        setStatus('idle');
        setError(null);
        setProgress(null);
        setJobId(null);
    }, [previewUrl]);

    /** Upload and generate subtitles (async queue-based) */
    const generateSubtitles = useCallback(async () => {
        if (!file) { setError('Please select a video'); return; }

        try {
            setStatus('uploading');
            setError(null);
            setProgress({ percent: 0, stage: 'uploading', message: 'Uploading video...' });

            // Step 1: Upload (returns jobId immediately)
            const result = await subtitleService.upload(file, (uploadPercent) => {
                if (!mountedRef.current) return;
                if (uploadPercent < 0) {
                    // Indeterminate — total unknown
                    setProgress({ percent: 5, stage: 'uploading', message: 'Uploading...' });
                } else {
                    const mapped = Math.round(uploadPercent * 0.15);
                    setProgress({ percent: mapped, stage: 'uploading', message: `Uploading... ${uploadPercent}%` });
                }
            });

            if (!mountedRef.current) return;

            if (!result.success || !result.jobId) {
                setError(result.message || 'Upload failed');
                setStatus('failed');
                return;
            }

            const newJobId = result.jobId;
            setJobId(newJobId);
            setStatus('generating');
            setProgress({ percent: 15, stage: 'generating', message: 'Generating subtitles...' });

            // Step 2: Try SSE progress first, with polling fallback
            const unsubscribe = subtitleService.subscribeToProgress(
                newJobId,
                (data) => {
                    if (!mountedRef.current) return;
                    setProgress(data);

                    if (data.stage === 'completed') {
                        // Job done — fetch segments
                        fetchSegments(newJobId);
                    }
                    if (data.stage === 'failed') {
                        setError(data.message || 'Subtitle generation failed');
                        setStatus('failed');
                        setProgress(null);
                    }
                },
                () => {
                    // SSE failed — fall back to polling
                    console.warn('SSE lost for subtitle job, polling...');
                    pollForResults(newJobId);
                }
            );
            unsubscribeRef.current = unsubscribe;

        } catch (err: any) {
            if (!mountedRef.current) return;
            const extracted = subtitleService.extractError(err);
            setError(extracted.message);
            setStatus('failed');
            setProgress(null);
        }
    }, [file]);

    /** Fetch segments after job completion */
    const fetchSegments = useCallback(async (jid: string) => {
        try {
            const result = await subtitleService.getJobStatus(jid);

            if (!mountedRef.current) return;

            if (result.status === 'completed' && result.segments) {
                const segsWithIds = result.segments.map((seg: any) => ({
                    id: genId(),
                    start: seg.start,
                    end: seg.end,
                    text: seg.text || '',
                }));

                setSegments(segsWithIds);
                setDuration(result.duration || 0);
                setStatus('ready');
                setProgress({ percent: 100, stage: 'completed', message: 'Subtitles ready!' });
                setTimeout(() => setProgress(null), 2000);
            } else {
                // Not ready yet, poll
                pollForResults(jid);
            }
        } catch (err: any) {
            if (!mountedRef.current) return;
            setError(err.message || 'Failed to load subtitles');
            setStatus('failed');
        }
    }, []);

    /** Poll for subtitle results (fallback) */
    const pollForResults = useCallback(async (jid: string) => {
        try {
            const result = await subtitleService.pollUntilDone(jid, (data) => {
                if (!mountedRef.current) return;
                setProgress(data);
            });

            if (!mountedRef.current) return;

            const segsWithIds = (result.segments || []).map((seg: any) => ({
                id: genId(),
                start: seg.start,
                end: seg.end,
                text: seg.text || '',
            }));

            setSegments(segsWithIds);
            setDuration(result.duration || 0);
            setStatus('ready');
            setProgress({ percent: 100, stage: 'completed', message: 'Subtitles ready!' });
            setTimeout(() => setProgress(null), 2000);
        } catch (err: any) {
            if (!mountedRef.current) return;
            setError(err.message || 'Subtitle generation failed');
            setStatus('failed');
            setProgress(null);
        }
    }, []);

    /** Update a single segment */
    const updateSegment = useCallback((id: string, updates: Partial<SubtitleSegment>) => {
        setSegments(prev => prev.map(seg =>
            seg.id === id ? { ...seg, ...updates } : seg
        ));
    }, []);

    /** Delete a segment */
    const deleteSegment = useCallback((id: string) => {
        setSegments(prev => prev.filter(seg => seg.id !== id));
    }, []);

    /** Add a new segment */
    const addSegment = useCallback((afterId?: string) => {
        const newSeg: SubtitleSegment = {
            id: genId(),
            start: currentTime,
            end: Math.min(currentTime + 3, duration),
            text: '',
        };
        if (afterId) {
            setSegments(prev => {
                const idx = prev.findIndex(s => s.id === afterId);
                const next = [...prev];
                next.splice(idx + 1, 0, newSeg);
                return next;
            });
        } else {
            setSegments(prev => [...prev, newSeg]);
        }
    }, [currentTime, duration]);

    /** Export video with subtitles */
    const exportVideo = useCallback(async () => {
        if (!jobId) { setError('No job to export'); return; }

        try {
            setStatus('exporting');
            setError(null);
            setProgress({ percent: 10, stage: 'exporting', message: 'Burning subtitles into video...' });

            await subtitleService.exportVideo(jobId, segments, style, subtitleEnabled);

            if (!mountedRef.current) return;
            setStatus('exported');
            setProgress({ percent: 100, stage: 'completed', message: 'Export complete!' });
        } catch (err: any) {
            if (!mountedRef.current) return;
            const extracted = subtitleService.extractError(err);
            setError(extracted.message);
            setStatus('failed');
            setProgress(null);
        }
    }, [jobId, segments, style, subtitleEnabled]);

    /** Reset everything */
    const reset = useCallback(() => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
        setFile(null);
        setPreviewUrl(null);
        setJobId(null);
        setSegments([]);
        setStyle(DEFAULT_SUBTITLE_STYLE);
        setSubtitleEnabled(true);
        setStatus('idle');
        setError(null);
        setProgress(null);
        setDuration(0);
        setCurrentTime(0);
    }, [previewUrl]);

    return {
        file, previewUrl, jobId, segments, style, subtitleEnabled,
        status, error, progress, duration, currentTime,
        selectFile, generateSubtitles,
        updateSegment, deleteSegment, addSegment,
        setStyle, setSubtitleEnabled,
        setCurrentTime, exportVideo, reset, setError,
    };
}
