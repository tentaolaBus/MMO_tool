'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadVideo, uploadYoutubeVideo, pollJobStatus } from '@/lib/api';

type UploadMode = 'file' | 'youtube';

export default function VideoUpload() {
    const router = useRouter();
    const [uploadMode, setUploadMode] = useState<UploadMode>('file');
    const [file, setFile] = useState<File | null>(null);
    const [youtubeUrl, setYoutubeUrl] = useState<string>('');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handle mode change with proper state reset
    const handleModeChange = (mode: UploadMode) => {
        if (mode === uploadMode) return;

        setUploadMode(mode);
        setFile(null);
        setYoutubeUrl('');
        setError(null);
        setProgress('');

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
        setUploading(true);
        setError(null);
        setProgress('');

        try {
            let result;

            if (uploadMode === 'file') {
                if (!file) {
                    setError('Please select a video file');
                    setUploading(false);
                    return;
                }
                setProgress('Uploading file...');
                result = await uploadVideo(file);
            } else {
                if (!youtubeUrl.trim()) {
                    setError('Please enter a YouTube URL');
                    setUploading(false);
                    return;
                }
                setProgress('Downloading from YouTube...');
                result = await uploadYoutubeVideo(youtubeUrl);
            }

            if (result.success && result.jobId) {
                const jobId = result.jobId;
                setProgress('Processing video...');

                // Poll for transcription completion
                await pollJobStatus(jobId, (job) => {
                    if (job.progress) {
                        setProgress('Processing...');
                    }
                });

                // Redirect to clips page
                router.push(`/job/${jobId}/clips`);
            } else {
                setError(result.message || 'Upload failed');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Upload failed');
        } finally {
            setUploading(false);
            setProgress('');
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Upload Video</h2>

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

                {/* Progress */}
                {progress && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-sm text-blue-700 flex items-center">
                            <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            {progress}
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
                    disabled={(uploadMode === 'file' && !file) || (uploadMode === 'youtube' && !youtubeUrl.trim()) || uploading}
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
