'use client';

import { useRef, useEffect, useState } from 'react';
import type { VideoMeta, OutputRatio } from '@/features/video-reframing/types';

interface ReframePreviewProps {
    /** Local object URL for the source video */
    videoUrl: string | null;
    /** Video metadata */
    meta: VideoMeta | null;
    /** Current crop X position (0–1) */
    cropX: number;
    /** Selected output ratio */
    ratio: OutputRatio;
    /** Whether auto-center is active */
    autoCenter: boolean;
}

/** Ratio constants */
const RATIO_VALUES: Record<OutputRatio, number> = {
    '9:16': 9 / 16,
    '1:1': 1,
    '4:5': 4 / 5,
};

const RATIO_DIMS: Record<OutputRatio, { w: number; h: number }> = {
    '9:16': { w: 1080, h: 1920 },
    '1:1': { w: 1080, h: 1080 },
    '4:5': { w: 1080, h: 1350 },
};

/**
 * ReframePreview — Shows a live preview of what the cropped output will look like.
 * Uses a canvas to draw the cropped region of the source video in real-time.
 */
export default function ReframePreview({
    videoUrl,
    meta,
    cropX,
    ratio,
    autoCenter,
}: ReframePreviewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Draw cropped region onto canvas each frame
    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !meta || !videoUrl) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dims = RATIO_DIMS[ratio];
        canvas.width = dims.w;
        canvas.height = dims.h;

        const ratioValue = RATIO_VALUES[ratio];

        const drawFrame = () => {
            if (video.paused || video.ended) {
                animFrameRef.current = requestAnimationFrame(drawFrame);
                return;
            }

            // Source crop dimensions
            const cropHeight = video.videoHeight;
            let cropWidth = Math.round(video.videoHeight * ratioValue);

            let srcX: number;
            let srcY = 0;

            if (cropWidth > video.videoWidth) {
                // Video is narrower than target ratio
                cropWidth = video.videoWidth;
                const adjustedHeight = Math.round(video.videoWidth / ratioValue);
                srcY = Math.round((video.videoHeight - adjustedHeight) / 2);
                srcX = 0;
                ctx.drawImage(
                    video,
                    srcX, srcY, cropWidth, adjustedHeight,
                    0, 0, canvas.width, canvas.height
                );
            } else {
                const maxOffset = video.videoWidth - cropWidth;
                const effectiveCropX = autoCenter ? 0.5 : cropX;
                srcX = Math.round(maxOffset * effectiveCropX);

                ctx.drawImage(
                    video,
                    srcX, srcY, cropWidth, cropHeight,
                    0, 0, canvas.width, canvas.height
                );
            }

            animFrameRef.current = requestAnimationFrame(drawFrame);
        };

        const handlePlay = () => {
            setIsPlaying(true);
            drawFrame();
        };

        const handlePause = () => setIsPlaying(false);

        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);

        // Start drawing if already playing
        if (!video.paused) {
            handlePlay();
        }

        return () => {
            cancelAnimationFrame(animFrameRef.current);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
        };
    }, [videoUrl, meta, cropX, ratio, autoCenter]);

    if (!videoUrl) {
        return (
            <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-border bg-muted/30">
                <p className="text-sm text-muted-foreground">
                    Upload a video to see the preview
                </p>
            </div>
        );
    }

    const dims = RATIO_DIMS[ratio];
    // Scale preview to fit in container (max height 400px)
    const previewHeight = Math.min(400, 400);
    const previewWidth = previewHeight * (dims.w / dims.h);

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Output Preview</h3>
                <span className="text-xs text-muted-foreground">
                    {dims.w}×{dims.h}
                </span>
            </div>

            <div className="flex items-center justify-center">
                <div
                    className="relative rounded-xl overflow-hidden border border-border bg-black shadow-lg"
                    style={{ width: previewWidth, height: previewHeight }}
                >
                    {/* Hidden source video (used as canvas source) */}
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        className="hidden"
                        muted
                        loop
                        autoPlay
                        playsInline
                    />

                    {/* Cropped preview canvas */}
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full object-contain"
                    />

                    {/* Platform badge */}
                    <div className="absolute top-2 left-2">
                        <span className="text-[10px] font-bold text-white/90 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
                            {ratio === '9:16' ? '📱 Vertical' : ratio === '1:1' ? '⬜ Square' : '📐 Portrait'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
