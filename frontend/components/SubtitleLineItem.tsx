'use client';

import React, { useState } from 'react';
import { SubtitleSegment } from '../lib/types';
import TimeInput from './TimeInput';

interface SubtitleLineItemProps {
    segment: SubtitleSegment;
    index: number;
    isActive: boolean;
    onChange: (index: number, segment: SubtitleSegment) => void;
    onSeek: (time: number) => void;
}

export default function SubtitleLineItem({
    segment,
    index,
    isActive,
    onChange,
    onSeek
}: SubtitleLineItemProps) {
    const [text, setText] = useState(segment.text);
    const [start, setStart] = useState(segment.start);
    const [end, setEnd] = useState(segment.end);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newText = e.target.value;
        setText(newText);
        onChange(index, { ...segment, text: newText });
    };

    const handleStartChange = (newStart: number) => {
        setStart(newStart);
        onChange(index, { ...segment, start: newStart });
    };

    const handleEndChange = (newEnd: number) => {
        setEnd(newEnd);
        onChange(index, { ...segment, end: newEnd });
    };

    const handleClick = () => {
        onSeek(start);
    };

    return (
        <div
            className={`
                border rounded-lg p-4 mb-2 cursor-pointer transition
                ${isActive ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 bg-white hover:bg-gray-50'}
            `}
            onClick={handleClick}
        >
            {/* Header with index and timing */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">
                    Line {index + 1}
                </span>

                <div className="flex items-center gap-2">
                    <TimeInput value={start} onChange={handleStartChange} />
                    <span className="text-gray-400">→</span>
                    <TimeInput value={end} onChange={handleEndChange} />
                </div>
            </div>

            {/* Text editor */}
            <textarea
                value={text}
                onChange={handleTextChange}
                onClick={(e) => e.stopPropagation()} // Don't seek when clicking text area
                className="w-full px-3 py-2 border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Subtitle text..."
            />

            {/* Duration indicator */}
            <div className="mt-2 text-xs text-gray-500">
                Duration: {(end - start).toFixed(2)}s
            </div>
        </div>
    );
}
