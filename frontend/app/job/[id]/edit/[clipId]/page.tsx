'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Clip, SubtitleSegment } from '../../../../../lib/types';
import { getSubtitles, updateSubtitles } from '../../../../../lib/api';
import SubtitleEditor from '../../../../../components/SubtitleEditor';
import RenderFinalButton from '../../../../../components/RenderFinalButton';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001';

export default function EditSubtitlesPage() {
    const params = useParams();
    const router = useRouter();
    const clipId = params.clipId as string;
    const jobId = params.id as string;

    const videoRef = useRef<HTMLVideoElement>(null);
    const [clip, setClip] = useState<Clip | null>(null);
    const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
    const [language, setLanguage] = useState('en');
    const [currentTime, setCurrentTime] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

    // Load clip and subtitles
    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);

                // Construct clip info from ID
                const clipIndexMatch = clipId.match(/_(\d+)$/);
                const clipIndex = clipIndexMatch ? parseInt(clipIndexMatch[1]) : 0;

                const mockClip: Clip = {
                    id: clipId,
                    jobId,
                    clipIndex,
                    videoUrl: `/storage/clips/clip_${clipId}.mp4`,
                    filename: `clip_${clipId}.mp4`,
                    size: 0,
                    createdAt: new Date().toISOString(),
                };

                setClip(mockClip);

                // Load subtitles
                const subtitlesData = await getSubtitles(clipId, language);
                if (subtitlesData.success && subtitlesData.segments) {
                    setSubtitles(subtitlesData.segments);
                }

                setLoading(false);
            } catch (err: any) {
                console.error('Error loading data:', err);
                setError(err.message || 'Failed to load subtitle data');
                setLoading(false);
            }
        };

        loadData();
    }, [clipId, jobId, language]);

    // Update video current time
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime);
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        return () => video.removeEventListener('timeupdate', handleTimeUpdate);
    }, []);

    // Listen for seek events from subtitle editor
    useEffect(() => {
        const handleSubtitleSeek = (event: CustomEvent) => {
            if (videoRef.current) {
                videoRef.current.currentTime = event.detail.time;
            }
        };

        window.addEventListener('subtitle-seek', handleSubtitleSeek as EventListener);
        return () => window.removeEventListener('subtitle-seek', handleSubtitleSeek as EventListener);
    }, []);

    // Handle subtitle changes
    const handleSubtitlesChange = (newSegments: SubtitleSegment[]) => {
        setSubtitles(newSegments);
    };

    // Save subtitles
    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await updateSubtitles(clipId, language, subtitles);
            setSuccessMessage('Subtitles saved successfully!');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error('Error saving subtitles:', err);
            setError(err.message || 'Failed to save subtitles');
        } finally {
            setSaving(false);
        }
    };

    // Render callbacks
    const handleRenderStart = () => {
        setFinalVideoUrl(null);
        setError(null);
        setSuccessMessage('Rendering final video...');
    };

    const handleRenderComplete = (videoUrl: string) => {
        setFinalVideoUrl(videoUrl);
        setSuccessMessage('Final video rendered successfully!');
    };

    const handleRenderError = (errorMsg: string) => {
        setError(errorMsg);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading subtitle editor...</p>
                </div>
            </div>
        );
    }

    if (!clip) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <p className="text-red-600 mb-4">Clip not found</p>
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

    const videoSrc = `${BACKEND_URL}${clip.videoUrl}`;

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Subtitle Editor</h1>
                    <p className="text-sm text-gray-600">
                        Clip #{clip.clipIndex !== undefined ? clip.clipIndex + 1 : '?'}
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="en">🇬🇧 English</option>
                        <option value="vi">🇻🇳 Vietnamese</option>
                        <option value="jp">🇯🇵 Japanese</option>
                        <option value="kr">🇰🇷 Korean</option>
                        <option value="cn">🇨🇳 Chinese</option>
                    </select>

                    <button
                        onClick={() => router.back()}
                        className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                        Cancel
                    </button>
                </div>
            </div>

            {/* Messages */}
            {error && (
                <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    ⚠️ {error}
                </div>
            )}
            {successMessage && (
                <div className="mx-6 mt-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
                    ✅ {successMessage}
                </div>
            )}

            {/* Main content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Video preview (left) */}
                <div className="w-1/2 p-6 bg-white border-r flex flex-col">
                    <h3 className="text-lg font-semibold mb-4">Video Preview</h3>

                    <div className="flex-1 flex items-center justify-center bg-black rounded-lg overflow-hidden">
                        <video
                            ref={videoRef}
                            src={videoSrc}
                            controls
                            className="max-w-full max-h-full"
                        />
                    </div>

                    {/* Save & Render buttons */}
                    <div className="mt-6 space-y-3">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`
                                w-full px-6 py-3 rounded-lg font-semibold text-white transition shadow-lg
                                ${saving
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700 hover:shadow-xl'
                                }
                            `}
                        >
                            {saving ? 'Saving...' : '💾 Save Changes'}
                        </button>

                        <RenderFinalButton
                            clipId={clipId}
                            language={language}
                            onRenderStart={handleRenderStart}
                            onRenderComplete={handleRenderComplete}
                            onError={handleRenderError}
                        />

                        {finalVideoUrl && (
                            <a
                                href={`${BACKEND_URL}${finalVideoUrl}`}
                                download
                                className="block w-full px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold text-center hover:bg-purple-700 transition shadow-lg"
                            >
                                ⬇️ Download Final Video
                            </a>
                        )}
                    </div>
                </div>

                {/* Subtitle editor (right) */}
                <div className="w-1/2 flex flex-col">
                    <SubtitleEditor
                        clipId={clipId}
                        language={language}
                        initialSegments={subtitles}
                        onSubtitlesChange={handleSubtitlesChange}
                        currentTime={currentTime}
                    />
                </div>
            </div>
        </div>
    );
}
