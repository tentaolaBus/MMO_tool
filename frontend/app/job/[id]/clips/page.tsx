'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import VideoPlayer from '../../../../components/VideoPlayer';
import ClipList from '../../../../components/ClipList';
import ClipPreviewModal from '../../../../components/ClipPreviewModal';
import { getJobStatus, getClips, renderClips, updateClipSelection, downloadSelectedClips, cleanupJob } from '../../../../lib/api';
import { Clip } from '../../../../lib/types';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001';

export default function ClipsPage() {
    const params = useParams();
    const router = useRouter();
    const pathname = usePathname();
    const jobId = params.id as string;

    const [job, setJob] = useState<any>(null);
    const [clips, setClips] = useState<Clip[]>([]);
    const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
    const [previewClip, setPreviewClip] = useState<Clip | null>(null);
    const [loading, setLoading] = useState(true);
    const [rendering, setRendering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // Refetch clips whenever this page becomes active via client-side navigation
    // (e.g., returning from subtitle editor after Save Style)
    useEffect(() => {
        setRefreshKey(k => k + 1);
    }, [pathname]);

    // Re-fetch clips when the tab regains focus (e.g., returning from edit page)
    useEffect(() => {
        const handleFocus = () => {
            console.log('🔄 Tab focused — refreshing clips');
            setRefreshKey(k => k + 1);
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    // Load job details and clips from database
    useEffect(() => {
        const loadJobAndClips = async () => {
            try {
                const jobData = await getJobStatus(jobId);
                setJob(jobData);

                if (jobData.status !== 'completed') {
                    // #region agent log
                    fetch('http://127.0.0.1:7740/ingest/d20e865f-85ea-4423-902d-fc4a5598c54d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0170bb'},body:JSON.stringify({sessionId:'0170bb',location:'clips/page.tsx:52',message:'Job not completed',data:{jobId:jobId,status:jobData.status,error:jobData.error},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
                    // #endregion
                    setError('Transcription not yet complete. Please wait.');
                    setLoading(false);
                    return;
                }

                // Try to load existing clips from database first
                const clipsData = await getClips(jobId);

                if (clipsData.success && clipsData.clips && clipsData.clips.length > 0) {
                    console.log(`Loaded ${clipsData.clips.length} clips from database`);
                    // DIAGNOSTIC: Log video URLs and timestamps to verify fresh data
                    clipsData.clips.forEach((c: any) => {
                        console.log(`  📋 Clip ${c.clipIndex}: videoUrl=${c.videoUrl} updatedAt=${c.updatedAt}`);
                    });
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
    }, [jobId, refreshKey]);

    // Render clips (only called if no clips in DB)
    const handleRenderClips = async () => {
        try {
            setRendering(true);
            console.log('Rendering clips for job:', jobId);

            const renderResult = await renderClips(jobId, 10);

            if (renderResult.success && renderResult.clips) {
                setClips(renderResult.clips);
                // Clips are already saved to database during render
                // Initialize UI selection state from the returned clips
                const selectedIds = new Set(
                    renderResult.clips
                        .filter((c: any) => c.selected)
                        .map((c: any) => c.id)
                );
                setSelectedClips(selectedIds);

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

    // Handle download of selected clips, then cleanup all job files
    const handleDownload = async () => {
        const ids = Array.from(selectedClips);
        if (ids.length === 0) return;

        setDownloading(true);
        setError(null);

        try {
            await downloadSelectedClips(ids);

            // Cleanup all files on the server after successful download
            try {
                await cleanupJob(jobId);
                console.log('Cleanup complete for job', jobId);
            } catch (cleanupErr) {
                console.warn('Cleanup failed (files may remain on server):', cleanupErr);
            }

            // Redirect to home after download + cleanup
            router.push('/');
        } catch (err: any) {
            console.error('Download failed:', err);
            setError(err.message || 'Failed to download clips');
        } finally {
            setDownloading(false);
        }
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
                onToggleClip={toggleClip}
                onToggleAll={toggleAll}
                onPreviewClip={handlePreview}
                backendUrl={process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001'}
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
                    onClick={handleDownload}
                    disabled={selectedClips.size === 0 || downloading}
                    className={`
                        px-6 py-3 rounded-lg font-semibold transition flex items-center gap-2
                        ${selectedClips.size > 0 && !downloading
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }
                    `}
                >
                    {downloading ? (
                        <>
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            {selectedClips.size > 1 ? 'Zipping & Downloading...' : 'Downloading...'}
                        </>
                    ) : (
                        <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download {selectedClips.size} clip{selectedClips.size !== 1 ? 's' : ''}{selectedClips.size > 1 ? ' (ZIP)' : ''}
                        </>
                    )}
                </button>
            </div>

            {/* Preview Modal */}
            {previewClip && (
                <ClipPreviewModal
                    clip={previewClip}
                    isOpen={!!previewClip}
                    onClose={() => setPreviewClip(null)}
                    backendUrl={process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001'}
                />
            )}
        </div>
    );
}
