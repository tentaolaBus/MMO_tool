'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import VideoPlayer from '../../../../components/VideoPlayer';
import ClipList from '../../../../components/ClipList';
import ClipPreviewModal from '../../../../components/ClipPreviewModal';
import { getJobStatus, getClips, renderClips, updateClipSelection } from '../../../../lib/api';
import { Clip } from '../../../../lib/types';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001';

export default function ClipsPage() {
    const params = useParams();
    const router = useRouter();
    const jobId = params.id as string;

    const [job, setJob] = useState<any>(null);
    const [clips, setClips] = useState<Clip[]>([]);
    const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
    const [previewClip, setPreviewClip] = useState<Clip | null>(null);
    const [loading, setLoading] = useState(true);
    const [rendering, setRendering] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load job details and clips from database
    useEffect(() => {
        const loadJobAndClips = async () => {
            try {
                const jobData = await getJobStatus(jobId);
                setJob(jobData);

                if (jobData.status !== 'completed') {
                    setError('Transcription not yet complete. Please wait.');
                    setLoading(false);
                    return;
                }

                // Try to load existing clips from database first
                const clipsData = await getClips(jobId);

                if (clipsData.success && clipsData.clips && clipsData.clips.length > 0) {
                    console.log(`Loaded ${clipsData.clips.length} clips from database`);
                    setClips(clipsData.clips);
                    // Restore selection from database
                    const selected = new Set(
                        clipsData.clips.filter((c: any) => c.selected).map((c: any) => c.id)
                    );
                    setSelectedClips(selected);
                    setLoading(false);
                } else {
                    // No clips in DB, render new ones
                    console.log('No clips found, starting render...');
                    await handleRenderClips();
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load job');
                setLoading(false);
            }
        };

        loadJobAndClips();
    }, [jobId]);

    // Render clips (only called if no clips in DB)
    const handleRenderClips = async () => {
        try {
            setRendering(true);
            console.log('Rendering clips for job:', jobId);

            const renderResult = await renderClips(jobId, 10);

            if (renderResult.success && renderResult.clips) {
                setClips(renderResult.clips);
                // Select all newly rendered clips
                const allIds = new Set(renderResult.clips.map((c: any) => c.id));
                setSelectedClips(allIds);

                // Update selection in database
                for (const clip of renderResult.clips) {
                    try {
                        await updateClipSelection(clip.id, true);
                    } catch (err) {
                        console.error('Failed to update clip selection:', err);
                    }
                }

                setLoading(false);
                setRendering(false);
            }
        } catch (err: any) {
            console.error('Failed to render clips:', err);
            setError(err.message || 'Failed to render clips');
            setLoading(false);
            setRendering(false);
        }
    };

    // Toggle single clip selection and sync with DB
    const toggleClip = async (clipId: string) => {
        const isCurrentlySelected = selectedClips.has(clipId);
        const newSelected = !isCurrentlySelected;

        // Update local state optimistically
        setSelectedClips(prev => {
            const next = new Set(prev);
            if (newSelected) {
                next.add(clipId);
            } else {
                next.delete(clipId);
            }
            return next;
        });

        // Sync with database
        try {
            await updateClipSelection(clipId, newSelected);
        } catch (err) {
            console.error('Failed to update clip selection:', err);
            // Revert on error
            setSelectedClips(prev => {
                const next = new Set(prev);
                if (isCurrentlySelected) {
                    next.add(clipId);
                } else {
                    next.delete(clipId);
                }
                return next;
            });
        }
    };

    // Toggle all clips
    const toggleAll = async () => {
        const allSelected = selectedClips.size === clips.length;
        const newSelection = allSelected ? new Set<string>() : new Set(clips.map(c => c.id));

        setSelectedClips(newSelection);

        // Update all in database
        for (const clip of clips) {
            try {
                await updateClipSelection(clip.id, !allSelected);
            } catch (err) {
                console.error('Failed to update clip selection:', err);
            }
        }
    };

    // Handle continue
    const handleContinue = () => {
        // TODO: Move to next phase (subtitle generation)
        alert(`Selected ${selectedClips.size} clips. Moving to Phase 3 (Subtitle Generation) coming soon!`);
    };

    // Handle preview
    const handlePreview = (clip: Clip) => {
        setPreviewClip(clip);
    };

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <p className="text-red-600 mb-4">{error}</p>
                    <button
                        onClick={() => router.back()}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    if (loading || rendering) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">
                        {rendering ? 'Generating clips...' : 'Loading...'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    Generated Clips
                </h1>
                <p className="text-gray-600">
                    Select the clips you want to continue with
                </p>
            </div>

            {/* Clips List */}
            <ClipList
                clips={clips}
                selectedClips={selectedClips}
                onToggle={toggleClip}
                onToggleAll={toggleAll}
                onPreview={handlePreview}
            />

            {/* Action Buttons */}
            <div className="mt-8 flex justify-end gap-4">
                <button
                    onClick={() => router.back()}
                    className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                >
                    Cancel
                </button>
                <button
                    onClick={handleContinue}
                    disabled={selectedClips.size === 0}
                    className={`
                        px-6 py-3 rounded-lg font-semibold transition
                        ${selectedClips.size > 0
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }
                    `}
                >
                    Continue with {selectedClips.size} clip{selectedClips.size !== 1 ? 's' : ''}
                </button>
            </div>

            {/* Preview Modal */}
            {previewClip && (
                <ClipPreviewModal
                    clip={previewClip}
                    jobId={jobId}
                    onClose={() => setPreviewClip(null)}
                />
            )}
        </div>
    );
}
