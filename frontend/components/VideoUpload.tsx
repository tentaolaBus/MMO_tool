'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { uploadVideo, uploadYoutubeVideo, subscribeToProgress } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

type UploadMode = 'file' | 'youtube';

interface ProgressState {
    percent: number;
    stage: string;
    message: string;
}

export default function VideoUpload() {
    const router = useRouter();
    const [uploadMode, setUploadMode] = useState<UploadMode>('file');
    const [file, setFile] = useState<File | null>(null);
    const [youtubeUrl, setYoutubeUrl] = useState<string>('');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<ProgressState | null>(null);
    const [progressText, setProgressText] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    // Auth state
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    const supabase = useMemo(() => {
        if (
            typeof window === 'undefined' &&
            (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
        ) {
            return null;
        }
        return createClient();
    }, []);

    // Check auth on mount
    useEffect(() => {
        if (!supabase) {
            setAuthLoading(false);
            return;
        }

        supabase.auth.getUser().then(({ data: { user } }) => {
            setUser(user);
            setAuthLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, [supabase]);

    // Cleanup SSE subscription on unmount
    useEffect(() => {
        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
            }
        };
    }, []);

    // Handle mode change with proper state reset
    const handleModeChange = (mode: UploadMode) => {
        if (mode === uploadMode) return;

        setUploadMode(mode);
        setFile(null);
        setYoutubeUrl('');
        setError(null);
        setProgress(null);
        setProgressText('');

        // Reset file input value
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleUpload = async () => {
        // ===== AUTH GUARD =====
        if (!user) {
            setError('Please login first to upload videos.');
            // Redirect to login after a brief delay so the user sees the message
            setTimeout(() => router.push('/login'), 1500);
            return;
        }

        setUploading(true);
        setError(null);
        setProgress(null);
        setProgressText('');

        try {
            let result;

            if (uploadMode === 'file') {
                if (!file) {
                    setError('Please select a video file');
                    setUploading(false);
                    return;
                }
                setProgressText('Uploading file...');
                setProgress({ percent: 5, stage: 'uploading', message: 'Uploading file...' });
                console.log('📤 Starting file upload...');
                result = await uploadVideo(file, (uploadPercent) => {
                    if (uploadPercent < 0) {
                        // Indeterminate — keep showing generic upload message
                        setProgress({ percent: 5, stage: 'uploading', message: 'Uploading...' });
                    } else {
                        const displayPercent = Math.max(5, Math.round(uploadPercent * 0.9)); // Scale 0-100 to 5-90
                        setProgress({ percent: displayPercent, stage: 'uploading', message: `Uploading... ${uploadPercent}%` });
                        setProgressText(`Uploading... ${uploadPercent}%`);
                    }
                });
                console.log('✅ Upload complete, result:', result);
            } else {
                if (!youtubeUrl.trim()) {
                    setError('Please enter a YouTube URL');
                    setUploading(false);
                    return;
                }
                setProgressText('Downloading from YouTube...');
                setProgress({ percent: 5, stage: 'downloading', message: 'Downloading from YouTube...' });
                result = await uploadYoutubeVideo(youtubeUrl);
                console.log('✅ YouTube download complete, result:', result);
            }

            if (result.success && result.jobId) {
                const jobId = result.jobId;
                setProgressText('Processing video...');
                setProgress({ percent: 10, stage: 'processing', message: 'Processing video...' });

                // Subscribe to real-time progress via SSE
                const unsubscribe = subscribeToProgress(
                    jobId,
                    (data) => {
                        setProgress({
                            percent: data.percent,
                            stage: data.stage,
                            message: data.message,
                        });
                        setProgressText(data.message);

                        // On completion, navigate to clips page
                        if (data.stage === 'completed') {
                            setTimeout(() => {
                                router.push(`/job/${jobId}/clips`);
                            }, 500);
                        }

                        // On failure, show error
                        if (data.stage === 'failed') {
                            setError(data.message || 'Video processing failed. Please try again.');
                            setUploading(false);
                        }
                    },
                    () => {
                        // SSE error — fallback to simple polling
                        console.warn('SSE connection lost, falling back to polling...');
                        fallbackPoll(jobId);
                    }
                );

                unsubscribeRef.current = unsubscribe;
            } else {
                setError(result.message || 'Upload failed');
                setUploading(false);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Upload failed');
            setUploading(false);
            setProgress(null);
            setProgressText('');
        }
    };

    /** Fallback polling if SSE connection fails */
    const fallbackPoll = async (jobId: string) => {
        const { pollJobStatus } = await import('@/lib/api');
        const completedJob = await pollJobStatus(jobId, (job) => {
            const pct = job.progress || 0;
            setProgress({ percent: pct, stage: 'processing', message: `Processing... ${pct}%` });
            setProgressText(`Processing... ${pct}%`);
        });

        if (completedJob.status === 'failed') {
            setError(completedJob.error || 'Video processing failed. Please try again.');
            setUploading(false);
            return;
        }

        router.push(`/job/${jobId}/clips`);
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Upload Video</h2>

            {/* Auth warning banner */}
            {!authLoading && !user && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <p className="text-sm text-amber-700 flex items-center">
                        <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Please <button onClick={() => router.push('/login')} className="font-semibold underline hover:text-amber-900">login</button> first to upload and process videos.
                    </p>
                </div>
            )}

            {/* Upload Mode Toggle */}
            <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
                <button
                    onClick={() => handleModeChange('file')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${uploadMode === 'file'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                        }`}
                >
                    📁 Upload File
                </button>
                <button
                    onClick={() => handleModeChange('youtube')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${uploadMode === 'youtube'
                        ? 'bg-white text-red-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                        }`}
                >
                    📺 YouTube URL
                </button>
            </div>

            <div className="space-y-4">
                {uploadMode === 'file' ? (
                    /* File Upload Mode */
                    <div key="file-upload-mode">
                        <label
                            htmlFor="video-input"
                            className="block text-sm font-medium text-gray-700 mb-2"
                        >
                            Select Video File
                        </label>
                        <input
                            ref={fileInputRef}
                            id="video-input"
                            type="file"
                            accept="video/*"
                            onChange={handleFileChange}
                            disabled={uploading}
                            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100
              disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        {file && (
                            <div className="mt-2 text-sm text-gray-600">
                                <p><strong>File:</strong> {file.name}</p>
                                <p><strong>Size:</strong> {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                        )}
                    </div>
                ) : (
                    /* YouTube URL Mode */
                    <div key="youtube-url-mode">
                        <label
                            htmlFor="youtube-url"
                            className="block text-sm font-medium text-gray-700 mb-2"
                        >
                            YouTube Video URL
                        </label>
                        <input
                            id="youtube-url"
                            type="text"
                            value={youtubeUrl}
                            onChange={(e) => {
                                setYoutubeUrl(e.target.value);
                                setError(null);
                            }}
                            placeholder="https://www.youtube.com/watch?v=..."
                            disabled={uploading}
                            className="block w-full px-4 py-2 text-sm text-gray-700 
                                border border-gray-300 rounded-md 
                                focus:ring-2 focus:ring-red-500 focus:border-red-500
                                disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Supports youtube.com, youtu.be, and YouTube Shorts links
                        </p>
                    </div>
                )}

                {/* Progress Bar */}
                {progress && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-blue-700 flex items-center">
                                <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                {progress.message}
                            </span>
                            <span className="text-blue-600 font-semibold">{progress.percent}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-700 ease-out"
                                style={{ width: `${progress.percent}%` }}
                            />
                        </div>
                        <p className="text-xs text-gray-500 capitalize">
                            Stage: {progress.stage.replace(/_/g, ' ')}
                        </p>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm text-red-600">{error}</p>
                    </div>
                )}

                {/* Submit Button */}
                <button
                    onClick={handleUpload}
                    disabled={(uploadMode === 'file' && !file) || (uploadMode === 'youtube' && !youtubeUrl.trim()) || uploading || authLoading}
                    className={`w-full py-3 px-4 font-semibold rounded-md transition-colors duration-200
                        disabled:bg-gray-300 disabled:cursor-not-allowed
                        ${uploadMode === 'file'
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                >
                    {uploading
                        ? 'Processing...'
                        : uploadMode === 'file'
                            ? 'Upload Video'
                            : 'Download & Process'}
                </button>
            </div>
        </div>
    );
}
