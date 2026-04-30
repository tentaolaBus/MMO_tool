'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Download, ChevronLeft, ChevronRight, Clock, Sparkles } from 'lucide-react';
import type { Clip } from '@/lib/types';

interface ClipPreviewModalProps {
    /** Currently previewed clip. When null, the modal is closed. */
    clip: Clip | null;
    /** Optional list to enable ←/→ keyboard navigation between clips. */
    clips?: Clip[];
    /** Close handler — fires on ESC, overlay click, and the close button. */
    onClose: () => void;
    /** Called when the user navigates to a different clip via ←/→ or chevron buttons. */
    onChange?: (clip: Clip) => void;
    /** Optional download handler — when provided, a Download button is shown. */
    onDownload?: (clip: Clip) => void;
    /** Backend URL prefix used when `clip.videoUrl` is a relative path. */
    backendUrl: string;
}

/**
 * Reusable, dark-themed clip preview modal.
 *
 * Features:
 *  • Centered, scale+fade animation (Framer Motion)
 *  • Closes on ESC key and on overlay click (not on inner clicks)
 *  • Optional ←/→ keyboard navigation between clips in a list
 *  • Loading skeleton until video metadata loads
 *  • Optional Download button
 *  • Mobile-responsive (max-w-3xl, padding, video keeps aspect ratio)
 */
export default function ClipPreviewModal({
    clip,
    clips,
    onClose,
    onChange,
    onDownload,
    backendUrl,
}: ClipPreviewModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [loading, setLoading] = useState(true);

    // Resolve where this clip sits in the list (for prev/next).
    const navIndex = useMemo(() => {
        if (!clip || !clips || clips.length === 0) return -1;
        return clips.findIndex((c) => c.id === clip.id);
    }, [clip, clips]);

    const hasPrev = !!clips && navIndex > 0;
    const hasNext = !!clips && navIndex >= 0 && navIndex < clips.length - 1;

    // Reset loading whenever the clip changes (so the skeleton appears).
    useEffect(() => {
        if (clip) setLoading(true);
    }, [clip?.id]);

    // Keyboard handlers: ESC closes, ←/→ navigate.
    useEffect(() => {
        if (!clip) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            if (!clips || !onChange || navIndex < 0) return;
            if (e.key === 'ArrowLeft' && navIndex > 0) {
                onChange(clips[navIndex - 1]);
            } else if (e.key === 'ArrowRight' && navIndex < clips.length - 1) {
                onChange(clips[navIndex + 1]);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [clip, clips, navIndex, onChange, onClose]);

    // Lock body scroll while modal is open.
    useEffect(() => {
        if (!clip) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [clip]);

    const videoSrc = useMemo(() => {
        if (!clip) return '';
        const cacheBuster = clip.updatedAt ? `?v=${new Date(clip.updatedAt).getTime()}` : '';
        const base = clip.videoUrl?.startsWith('http') ? clip.videoUrl : `${backendUrl}${clip.videoUrl}`;
        return `${base}${cacheBuster}`;
    }, [clip, backendUrl]);

    const score = clip?.score?.total ?? 0;
    const displayScore = (score / 10).toFixed(1);
    const duration = clip?.duration ? `${Math.round(clip.duration)}s` : null;

    return (
        <AnimatePresence>
            {clip && (
                <motion.div
                    key="clip-preview-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 sm:p-6"
                    onClick={onClose}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Preview clip ${clip.clipIndex + 1}`}
                >
                    <motion.div
                        key={`clip-preview-content-${clip.id}`}
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close */}
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close preview"
                            className="absolute top-3 right-3 z-20 size-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                            <X className="size-4" />
                        </button>

                        {/* Prev / Next chevrons (only when multiple clips) */}
                        {hasPrev && onChange && (
                            <button
                                type="button"
                                onClick={() => onChange(clips![navIndex - 1])}
                                aria-label="Previous clip"
                                className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 size-10 rounded-full bg-black/60 hover:bg-black/80 text-white items-center justify-center backdrop-blur-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                <ChevronLeft className="size-5" />
                            </button>
                        )}
                        {hasNext && onChange && (
                            <button
                                type="button"
                                onClick={() => onChange(clips![navIndex + 1])}
                                aria-label="Next clip"
                                className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 size-10 rounded-full bg-black/60 hover:bg-black/80 text-white items-center justify-center backdrop-blur-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                <ChevronRight className="size-5" />
                            </button>
                        )}

                        {/* Video */}
                        <div className="relative bg-black aspect-video w-full">
                            {loading && (
                                <div
                                    className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black"
                                    aria-hidden="true"
                                >
                                    <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                                    <div className="size-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                                </div>
                            )}
                            <video
                                key={videoSrc}
                                ref={videoRef}
                                src={videoSrc}
                                controls
                                autoPlay
                                playsInline
                                onLoadedData={() => setLoading(false)}
                                onCanPlay={() => setLoading(false)}
                                onWaiting={() => setLoading(true)}
                                onPlaying={() => setLoading(false)}
                                onError={() => setLoading(false)}
                                className="w-full h-full object-contain bg-black"
                            />
                        </div>

                        {/* Info */}
                        <div className="p-4 sm:p-5 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="text-base sm:text-lg font-semibold text-foreground truncate">
                                        Clip #{clip.clipIndex + 1}
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                                        {duration && (
                                            <span className="inline-flex items-center gap-1">
                                                <Clock className="size-3" /> {duration}
                                            </span>
                                        )}
                                        {score > 0 && (
                                            <span className="inline-flex items-center gap-1">
                                                <Sparkles className="size-3 text-purple-400" />
                                                {displayScore}/10 score
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {onDownload && (
                                    <button
                                        type="button"
                                        onClick={() => onDownload(clip)}
                                        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-semibold shadow-md transition-all active:scale-[0.98]"
                                    >
                                        <Download className="size-3.5" />
                                        Download
                                    </button>
                                )}
                            </div>

                            {clip.text && (
                                <p className="text-sm text-muted-foreground italic leading-relaxed line-clamp-3">
                                    &quot;{clip.text}&quot;
                                </p>
                            )}

                            {clips && clips.length > 1 && navIndex >= 0 && (
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground/70 pt-1 border-t border-border/50">
                                    <span>
                                        {navIndex + 1} / {clips.length}
                                    </span>
                                    <span className="hidden sm:inline">Use ← → to navigate · ESC to close</span>
                                    <span className="sm:hidden">ESC to close</span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
