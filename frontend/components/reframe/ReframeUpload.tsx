'use client';

import { useRef, useState, useCallback } from 'react';
import { Upload, FileVideo, X, AlertCircle } from 'lucide-react';

interface ReframeUploadProps {
    onFileSelect: (file: File) => void;
    file: File | null;
    disabled?: boolean;
}

const MAX_FILE_SIZE_MB = 500;
const ACCEPTED_TYPES = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm'];

export default function ReframeUpload({ onFileSelect, file, disabled }: ReframeUploadProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const validateFile = useCallback((f: File): string | null => {
        if (!ACCEPTED_TYPES.includes(f.type) && !f.name.match(/\.(mp4|mov|avi|mpeg|webm)$/i)) {
            return 'Invalid file type. Please upload an MP4, MOV, AVI, or WebM video.';
        }
        if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            return `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`;
        }
        return null;
    }, []);

    const handleFile = useCallback((f: File) => {
        const err = validateFile(f);
        if (err) {
            setError(err);
            return;
        }
        setError(null);
        onFileSelect(f);
    }, [validateFile, onFileSelect]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setIsDragging(true);
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (disabled) return;

        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) handleFile(droppedFile);
    }, [disabled, handleFile]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) handleFile(selectedFile);
    }, [handleFile]);

    const clearFile = useCallback(() => {
        setError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        onFileSelect(null as any); // Parent handles null
    }, [onFileSelect]);

    return (
        <div className="w-full">
            {/* Drop Zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !disabled && fileInputRef.current?.click()}
                className={`
                    relative flex flex-col items-center justify-center
                    w-full min-h-[220px] rounded-2xl border-2 border-dashed
                    transition-all duration-300 cursor-pointer
                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                    ${isDragging
                        ? 'border-purple-400 bg-purple-500/10 scale-[1.01]'
                        : file
                            ? 'border-green-400/50 bg-green-500/5'
                            : 'border-border hover:border-purple-400/50 hover:bg-muted/50'
                    }
                `}
            >
                {/* Animated gradient border effect on drag */}
                {isDragging && (
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-purple-500/20 animate-pulse" />
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleInputChange}
                    disabled={disabled}
                    className="hidden"
                    id="reframe-video-input"
                />

                {file ? (
                    /* File Selected State */
                    <div className="relative z-10 flex flex-col items-center gap-3 p-6">
                        <div className="size-14 rounded-xl bg-green-500/10 flex items-center justify-center">
                            <FileVideo className="size-7 text-green-500" />
                        </div>
                        <div className="text-center">
                            <p className="font-semibold text-foreground text-sm truncate max-w-[300px]">
                                {file.name}
                            </p>
                            <p className="text-muted-foreground text-xs mt-1">
                                {(file.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                        </div>
                        {!disabled && (
                            <button
                                onClick={(e) => { e.stopPropagation(); clearFile(); }}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors mt-1"
                            >
                                <X className="size-3" />
                                Change file
                            </button>
                        )}
                    </div>
                ) : (
                    /* Empty State */
                    <div className="relative z-10 flex flex-col items-center gap-3 p-6">
                        <div className="size-14 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Upload className="size-7 text-purple-500" />
                        </div>
                        <div className="text-center">
                            <p className="font-semibold text-foreground text-sm">
                                Drop your video here or <span className="text-purple-500">browse</span>
                            </p>
                            <p className="text-muted-foreground text-xs mt-1">
                                MP4, MOV, AVI, WebM • Max {MAX_FILE_SIZE_MB}MB
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle className="size-4 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-400">{error}</p>
                </div>
            )}
        </div>
    );
}
