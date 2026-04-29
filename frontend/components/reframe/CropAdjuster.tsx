'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { VideoMeta, OutputRatio } from '@/features/video-reframing/types';

interface CropAdjusterProps {
    /** Local object URL for the source video */
    videoUrl: string;
    /** Video metadata (dimensions) */
    meta: VideoMeta | null;
    /** Current crop X position (0–1) */
    cropX: number;
    /** Selected output ratio */
    ratio: OutputRatio;
    /** Whether auto-center is active */
    autoCenter: boolean;
    /** Callback when user drags crop position */
    onCropXChange: (cropX: number) => void;
}

/** Ratio constants for crop calculations */
const RATIO_VALUES: Record<OutputRatio, number> = {
    '9:16': 9 / 16,
    '1:1': 1,
    '4:5': 4 / 5,
};

export default function CropAdjuster({
    videoUrl,
    meta,
    cropX,
    ratio,
    autoCenter,
    onCropXChange,
}: CropAdjusterProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [videoLoaded, setVideoLoaded] = useState(false);
    const [displayDims, setDisplayDims] = useState({ w: 0, h: 0, offsetX: 0, offsetY: 0 });

    // Calculate display dimensions when video loads
    useEffect(() => {
        if (!meta || !containerRef.current) return;

        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = Math.min(400, containerWidth * (meta.height / meta.width));

        setDisplayDims({
            w: containerWidth,
            h: containerHeight,
            offsetX: 0,
            offsetY: 0,
        });
    }, [meta, videoLoaded]);

    // Calculate crop rectangle position in display coordinates
    const getCropRect = useCallback(() => {
        if (!meta || displayDims.w === 0) return null;

        const ratioValue = RATIO_VALUES[ratio];
        const cropWidthFraction = Math.min(1, (meta.height * ratioValue) / meta.width);
        const cropDisplayWidth = displayDims.w * cropWidthFraction;
        const maxOffsetDisplay = displayDims.w - cropDisplayWidth;

        const effectiveCropX = autoCenter ? 0.5 : cropX;
        const xOffset = maxOffsetDisplay * effectiveCropX;

        return {
            x: xOffset,
            y: 0,
            width: cropDisplayWidth,
            height: displayDims.h,
        };
    }, [meta, displayDims, ratio, cropX, autoCenter]);

    const cropRect = getCropRect();

    // Drag handling
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (autoCenter || !containerRef.current || !meta) return;
        e.preventDefault();
        setIsDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, [autoCenter, meta]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging || !containerRef.current || !meta) return;

        const rect = containerRef.current.getBoundingClientRect();
        const ratioValue = RATIO_VALUES[ratio];
        const cropWidthFraction = Math.min(1, (meta.height * ratioValue) / meta.width);
        const cropDisplayWidth = rect.width * cropWidthFraction;
        const maxOffset = rect.width - cropDisplayWidth;

        if (maxOffset <= 0) return;

        // Calculate position: center of the crop rect should follow cursor
        const relativeX = e.clientX - rect.left - cropDisplayWidth / 2;
        const newCropX = Math.max(0, Math.min(1, relativeX / maxOffset));
        onCropXChange(newCropX);
    }, [isDragging, meta, ratio, onCropXChange]);

    const handlePointerUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Crop Preview</h3>
                {!autoCenter && (
                    <span className="text-xs text-muted-foreground">
                        Drag the highlighted area to adjust
                    </span>
                )}
            </div>

            <div
                ref={containerRef}
                className="relative w-full rounded-xl overflow-hidden bg-black/90 border border-border select-none"
                style={{ height: displayDims.h || 300 }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
            >
                {/* Source Video */}
                <video
                    ref={videoRef}
                    src={videoUrl}
                    className="absolute inset-0 w-full h-full object-contain"
                    muted
                    loop
                    autoPlay
                    playsInline
                    onLoadedMetadata={() => setVideoLoaded(true)}
                />

                {/* Dark overlay for areas outside crop */}
                {cropRect && (
                    <>
                        {/* Left dim */}
                        <div
                            className="absolute top-0 bottom-0 left-0 bg-black/60 transition-all duration-150"
                            style={{ width: cropRect.x }}
                        />
                        {/* Right dim */}
                        <div
                            className="absolute top-0 bottom-0 right-0 bg-black/60 transition-all duration-150"
                            style={{ width: displayDims.w - cropRect.x - cropRect.width }}
                        />

                        {/* Crop frame border */}
                        <div
                            className={`
                                absolute top-0 bottom-0 border-2 transition-all duration-150
                                ${autoCenter
                                    ? 'border-blue-400/70'
                                    : isDragging
                                        ? 'border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.3)]'
                                        : 'border-purple-400/70 hover:border-purple-400 cursor-ew-resize'
                                }
                            `}
                            style={{
                                left: cropRect.x,
                                width: cropRect.width,
                            }}
                        >
                            {/* Center line guide */}
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />

                            {/* Drag handle (only in manual mode) */}
                            {!autoCenter && (
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                    <div className="w-1 h-8 rounded-full bg-white/60" />
                                    <div className="w-1 h-8 rounded-full bg-white/60" />
                                    <div className="w-1 h-8 rounded-full bg-white/60" />
                                </div>
                            )}

                            {/* Ratio label */}
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                                <span className="text-[10px] font-bold text-white/80 bg-black/50 px-2 py-0.5 rounded-full">
                                    {ratio}
                                </span>
                            </div>
                        </div>
                    </>
                )}

                {/* No video loaded yet */}
                {!videoLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="animate-pulse text-sm text-muted-foreground">
                            Loading video...
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
