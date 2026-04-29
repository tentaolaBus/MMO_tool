'use client';

import { useRef, useState, useCallback } from 'react';
import { Upload, FileVideo, X, AlertCircle } from 'lucide-react';

interface ClipperUploadProps {
    onFileSelect: (file: File) => void;
    file: File | null;
    disabled?: boolean;
}

export default function ClipperUpload({ onFileSelect, file, disabled }: ClipperUploadProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFile = useCallback((f: File) => {
        if (f.size > 500 * 1024 * 1024) {
            setError('File too large. Maximum size is 500MB.');
            return;
        }
        setError(null);
        onFileSelect(f);
    }, [onFileSelect]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
    }, [disabled, handleFile]);

    return (
        <div className="w-full">
            <div
                onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={handleDrop}
                onClick={() => !disabled && fileInputRef.current?.click()}
                className={`
                    relative flex flex-col items-center justify-center
                    w-full min-h-[180px] rounded-2xl border-2 border-dashed
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
                {isDragging && (
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-purple-500/20 animate-pulse" />
                )}

                <input
                    ref={fileInputRef} type="file" accept="video/*"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    disabled={disabled} className="hidden" id="clipper-video-input"
                />

                {file ? (
                    <div className="relative z-10 flex flex-col items-center gap-3 p-5">
                        <div className="size-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                            <FileVideo className="size-6 text-green-500" />
                        </div>
                        <div className="text-center">
                            <p className="font-semibold text-foreground text-sm truncate max-w-[260px]">{file.name}</p>
                            <p className="text-muted-foreground text-xs mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                        </div>
                        {!disabled && (
                            <button onClick={(e) => { e.stopPropagation(); onFileSelect(null as any); }}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors">
                                <X className="size-3" /> Change
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="relative z-10 flex flex-col items-center gap-3 p-5">
                        <div className="size-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Upload className="size-6 text-purple-500" />
                        </div>
                        <div className="text-center">
                            <p className="font-semibold text-foreground text-sm">
                                Drop your video or <span className="text-purple-500">browse</span>
                            </p>
                            <p className="text-muted-foreground text-xs mt-0.5">MP4, MOV, AVI • Max 500MB</p>
                        </div>
                    </div>
                )}
            </div>
            {error && (
                <div className="flex items-center gap-2 mt-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle className="size-4 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-400">{error}</p>
                </div>
            )}
        </div>
    );
}
