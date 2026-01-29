'use client';

import { useState } from 'react';
import { uploadVideo } from '@/lib/api';

interface VideoUploadProps {
    onUploadSuccess: (jobId: string) => void;
}

export default function VideoUpload({ onUploadSuccess }: VideoUploadProps) {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setError('Please select a video file');
            return;
        }

        setUploading(true);
        setError(null);

        try {
            const result = await uploadVideo(file);

            if (result.success && result.jobId) {
                onUploadSuccess(result.jobId);
                setFile(null);
                // Reset file input
                const fileInput = document.getElementById('video-input') as HTMLInputElement;
                if (fileInput) fileInput.value = '';
            } else {
                setError(result.message || 'Upload failed');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Upload Video</h2>

            <div className="space-y-4">
                <div>
                    <label
                        htmlFor="video-input"
                        className="block text-sm font-medium text-gray-700 mb-2"
                    >
                        Select Video File
                    </label>
                    <input
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
                </div>

                {file && (
                    <div className="text-sm text-gray-600">
                        <p><strong>File:</strong> {file.name}</p>
                        <p><strong>Size:</strong> {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                )}

                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm text-red-600">{error}</p>
                    </div>
                )}

                <button
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-md
            hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed
            transition-colors duration-200"
                >
                    {uploading ? 'Uploading...' : 'Upload Video'}
                </button>
            </div>
        </div>
    );
}
