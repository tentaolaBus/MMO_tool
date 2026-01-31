'use client';

import React from 'react';
import { SubtitleSegment } from '../lib/types';

interface SubtitleOverlayProps {
    segments: SubtitleSegment[];
    currentTime: number;
    enabled: boolean;
}

export default function SubtitleOverlay({ segments, currentTime, enabled }: SubtitleOverlayProps) {
    if (!enabled || segments.length === 0) {
        return null;
    }

    // Find the current subtitle segment
    const currentSegment = segments.find(
        (seg) => currentTime >= seg.start && currentTime < seg.end
    );

    // Debug: Log current time and found segment
    if (currentTime > 0 && currentTime < 1) {
        console.log('Subtitle overlay - segments:', segments.length, 'current time:', currentTime.toFixed(2));
    }

    if (!currentSegment) {
        return null;
    }

    return (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-12 pointer-events-none z-10">
            <div
                className="px-4 py-2 rounded-md max-w-[90%] text-center"
                style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    color: 'white',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.9)',
                    lineHeight: '1.4',
                }}
            >
                {currentSegment.text}
            </div>
        </div>
    );
}
