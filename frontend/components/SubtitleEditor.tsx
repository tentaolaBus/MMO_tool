'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SubtitleSegment } from '../lib/types';
import SubtitleLineItem from './SubtitleLineItem';

interface SubtitleEditorProps {
    clipId: string;
    language: string;
    initialSegments: SubtitleSegment[];
    onSubtitlesChange: (segments: SubtitleSegment[]) => void;
    currentTime: number;
}

export default function SubtitleEditor({
    clipId,
    language,
    initialSegments,
    onSubtitlesChange,
    currentTime
}: SubtitleEditorProps) {
    const [segments, setSegments] = useState<SubtitleSegment[]>(initialSegments);
    const containerRef = useRef<HTMLDivElement>(null);
    const activeLineRef = useRef<HTMLDivElement>(null);

    // Find active line based on current time
    const activeIndex = segments.findIndex(
        (seg) => currentTime >= seg.start && currentTime < seg.end
    );

    // Handle segment change
    const handleSegmentChange = (index: number, newSegment: SubtitleSegment) => {
        const newSegments = [...segments];
        newSegments[index] = newSegment;
        setSegments(newSegments);
        onSubtitlesChange(newSegments);
    };

    // Handle seek to timeline
    const handleSeek = (time: number) => {
        // This will be passed up to the video player
        const seekEvent = new CustomEvent('subtitle-seek', { detail: { time } });
        window.dispatchEvent(seekEvent);
    };

    // Auto-scroll to active line
    useEffect(() => {
        if (activeLineRef.current && containerRef.current) {
            const container = containerRef.current;
            const activeElement = activeLineRef.current;

            const containerRect = container.getBoundingClientRect();
            const activeRect = activeElement.getBoundingClientRect();

            // Check if active element is outside visible area
            if (activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom) {
                activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [activeIndex]);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                        Subtitle Editor
                    </h3>
                    <p className="text-sm text-gray-600">
                        {segments.length} lines • {language.toUpperCase()}
                    </p>
                </div>

                <div className="text-sm text-gray-500">
                    Click a line to seek video
                </div>
            </div>

            {/* Subtitle list */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto p-4 bg-gray-50"
            >
                {segments.map((segment, index) => (
                    <div
                        key={index}
                        ref={index === activeIndex ? activeLineRef : null}
                    >
                        <SubtitleLineItem
                            segment={segment}
                            index={index}
                            isActive={index === activeIndex}
                            onChange={handleSegmentChange}
                            onSeek={handleSeek}
                        />
                    </div>
                ))}

                {segments.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        No subtitles loaded
                    </div>
                )}
            </div>
        </div>
    );
}
