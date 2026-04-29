'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { SubtitleSegment } from '@/features/video-subtitles/types';
import type { SubtitleStyle } from '@/lib/types';

interface SubtitleVideoPlayerProps {
    videoUrl: string | null;
    segments: SubtitleSegment[];
    style: SubtitleStyle;
    subtitleEnabled: boolean;
    currentTime: number;
    onTimeUpdate: (time: number) => void;
    onDurationChange?: (dur: number) => void;
}

export default function SubtitleVideoPlayer({
    videoUrl,
    segments,
    style,
    subtitleEnabled,
    currentTime,
    onTimeUpdate,
    onDurationChange,
}: SubtitleVideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    // Find active subtitle for current time
    const activeSegment = useMemo(() => {
        if (!subtitleEnabled || segments.length === 0) return null;
        return segments.find(s => currentTime >= s.start && currentTime <= s.end) || null;
    }, [segments, currentTime, subtitleEnabled]);

    // Seek video when currentTime changes externally
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (Math.abs(video.currentTime - currentTime) > 0.5) {
            video.currentTime = currentTime;
        }
    }, [currentTime]);

    if (!videoUrl) {
        return (
            <div className="flex items-center justify-center h-64 rounded-xl bg-muted/30 border border-border">
                <p className="text-sm text-muted-foreground">Upload a video to preview</p>
            </div>
        );
    }

    // Build inline styles for subtitle overlay
    const bgOpacity = Math.round(style.backgroundOpacity * 255).toString(16).padStart(2, '0');
    const subtitleOverlayStyle: React.CSSProperties = {
        fontSize: `${style.fontSize}px`,
        fontWeight: style.fontWeight,
        color: style.textColor,
        backgroundColor: style.backgroundOpacity > 0 ? `${style.backgroundColor}${bgOpacity}` : 'transparent',
        borderRadius: `${style.borderRadius}px`,
        padding: `${style.padding}px ${style.padding + 4}px`,
        letterSpacing: `${style.letterSpacing}px`,
        lineHeight: style.lineHeight,
        textShadow: style.textShadow ? '2px 2px 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5)' : 'none',
        maxWidth: '90%',
        textAlign: 'center' as const,
    };

    const positionClass = style.position === 'middle'
        ? 'top-1/2 -translate-y-1/2'
        : style.position === 'top'
            ? 'top-6'
            : 'bottom-8';

    return (
        <div className="relative w-full rounded-xl overflow-hidden bg-black border border-border">
            <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="w-full aspect-video object-contain"
                onTimeUpdate={(e) => onTimeUpdate((e.target as HTMLVideoElement).currentTime)}
                onLoadedMetadata={(e) => onDurationChange?.((e.target as HTMLVideoElement).duration)}
            />

            {/* Subtitle overlay */}
            {activeSegment && subtitleEnabled && (
                <div className={`absolute left-1/2 -translate-x-1/2 ${positionClass} pointer-events-none z-10 transition-opacity duration-200`}>
                    <div style={subtitleOverlayStyle}>
                        {activeSegment.text}
                    </div>
                </div>
            )}
        </div>
    );
}
