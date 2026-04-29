/**
 * useClipProcessing — React hook for the clip loading/rendering lifecycle.
 *
 * Encapsulates the entire workflow:
 * 1. Check for existing clips
 * 2. If none, render new clips
 * 3. Handle progress, errors, selection
 *
 * Usage:
 *   const { clips, loading, error, toggleClip } = useClipProcessing(jobId);
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { clipService } from '../services/clipService';
import type { Clip } from '@/lib/types';

export interface ClipProcessingState {
    clips: Clip[];
    selectedClips: Set<string>;
    loading: boolean;
    rendering: boolean;
    error: string | null;
    renderProgress: { percent: number; stage: string; message: string } | null;
}

export function useClipProcessing(jobId: string) {
    const [clips, setClips] = useState<Clip[]>([]);
    const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [rendering, setRendering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [renderProgress, setRenderProgress] = useState<{
        percent: number;
        stage: string;
        message: string;
    } | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    /** Load existing clips or trigger rendering */
    const loadClips = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const result = await clipService.getClips(jobId);

            if (!mountedRef.current) return;

            if (result.success && result.clips?.length > 0) {
                setClips(result.clips);
                const selected = new Set(
                    result.clips.filter((c: Clip) => c.selected).map((c: Clip) => c.id)
                );
                setSelectedClips(selected);
                setLoading(false);
            } else {
                // No clips — render new ones
                await renderClips();
            }
        } catch (err: any) {
            if (!mountedRef.current) return;
            setError(err.message || 'Failed to load clips');
            setLoading(false);
        }
    }, [jobId]);

    /** Render new clips via API */
    const renderClips = useCallback(async () => {
        try {
            setRendering(true);
            setRenderProgress({ percent: 0, stage: 'starting', message: 'Starting clip generation...' });

            const result = await clipService.renderClips(jobId, 10, (status, pct) => {
                if (!mountedRef.current) return;
                setRenderProgress({ percent: pct, stage: status, message: `Processing... ${pct}%` });
            });

            if (!mountedRef.current) return;

            if (result.success && result.clips) {
                setClips(result.clips);
                const selectedIds = new Set(
                    result.clips.filter((c: any) => c.selected).map((c: any) => c.id)
                );
                setSelectedClips(selectedIds);
            }
        } catch (err: any) {
            if (!mountedRef.current) return;
            setError(err.message || 'Failed to render clips');
        } finally {
            if (mountedRef.current) {
                setLoading(false);
                setRendering(false);
                setRenderProgress(null);
            }
        }
    }, [jobId]);

    /** Toggle single clip selection */
    const toggleClip = useCallback(async (clipId: string) => {
        const isSelected = selectedClips.has(clipId);
        const newSelected = !isSelected;

        // Optimistic update
        setSelectedClips((prev) => {
            const next = new Set(prev);
            newSelected ? next.add(clipId) : next.delete(clipId);
            return next;
        });

        try {
            await clipService.updateSelection(clipId, newSelected);
        } catch {
            // Revert on error
            setSelectedClips((prev) => {
                const next = new Set(prev);
                isSelected ? next.add(clipId) : next.delete(clipId);
                return next;
            });
        }
    }, [selectedClips]);

    /** Toggle all clips */
    const toggleAll = useCallback(async () => {
        const allSelected = selectedClips.size === clips.length;
        const newSelection = allSelected ? new Set<string>() : new Set(clips.map((c) => c.id));
        setSelectedClips(newSelection);

        for (const clip of clips) {
            try {
                await clipService.updateSelection(clip.id, !allSelected);
            } catch {
                console.error('Failed to update clip selection');
            }
        }
    }, [clips, selectedClips]);

    return {
        clips,
        selectedClips,
        loading,
        rendering,
        error,
        renderProgress,
        loadClips,
        renderClips,
        toggleClip,
        toggleAll,
        setError,
    };
}
