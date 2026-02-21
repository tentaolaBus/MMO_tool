'use client';

import React from 'react';
import { SubtitleSegment, SubtitleStyle } from '../lib/types';

interface SubtitleOverlayProps {
    segments: SubtitleSegment[];
    currentTime: number;
    enabled: boolean;
    style?: SubtitleStyle | null;
}

function hexToRgba(hex: string, opacity: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${opacity})`;
}

export default function SubtitleOverlay({ segments, currentTime, enabled, style }: SubtitleOverlayProps) {
    if (!enabled || segments.length === 0) {
        return null;
    }

    const epsilon = 0.05;
    const currentSegment = segments.find(
        (seg) => currentTime >= (seg.start - epsilon) && currentTime < (seg.end + epsilon)
    );

    if (!currentSegment) {
        return null;
    }

    const positionStyle: React.CSSProperties = style?.position === 'middle'
        ? { top: '50%', transform: 'translateY(-50%)' }
        : { bottom: '8%' };

    const textStyle: React.CSSProperties = style
        ? {
            display: 'inline-block',
            fontSize: `${style.fontSize}px`,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            letterSpacing: `${style.letterSpacing}px`,
            color: style.textColor,
            backgroundColor: hexToRgba(style.backgroundColor, style.backgroundOpacity),
            padding: `${style.padding}px ${style.padding * 1.75}px`,
            borderRadius: `${style.borderRadius}px`,
            maxWidth: '90%',
            wordBreak: 'break-word' as const,
            textShadow: style.textShadow
                ? '0 0 3px rgba(0,0,0,0.9), 0 2px 6px rgba(0,0,0,0.7), 0 0 12px rgba(0,0,0,0.4)'
                : 'none',
        }
        : {
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            color: 'white',
            fontSize: '20px',
            fontWeight: 'bold',
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.9)',
            lineHeight: '1.4',
            maxWidth: '90%',
        };

    return (
        <div
            className="absolute left-0 right-0 flex justify-center pointer-events-none z-10"
            style={{ padding: '0 12px', ...positionStyle }}
        >
            <div
                className="px-4 py-2 rounded-md text-center"
                style={textStyle}
            >
                {currentSegment.text}
            </div>
        </div>
    );
}

