'use client';

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { SubtitleSegment } from '../lib/types';

// Generate unique ID for new subtitles
const generateId = () => `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Extended subtitle type with ID for editing
interface SubtitleLine extends SubtitleSegment {
    id: string;
}

interface SubtitleEditorProps {
    clipId: string;
    language: string;
    initialSegments: SubtitleSegment[];
    onSubtitlesChange: (segments: SubtitleSegment[]) => void;
    currentTime: number;
}

// Format seconds to MM:SS.ms format
function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

// Parse MM:SS.ms to seconds
function parseTime(timeStr: string): number | null {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
    if (!match) return null;

    const mins = parseInt(match[1]);
    const secs = parseInt(match[2]);
    const ms = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0;

    if (secs >= 60) return null;
    return mins * 60 + secs + ms / 1000;
}

// Memoized subtitle line component
const SubtitleLineRow = memo(function SubtitleLineRow({
    line,
    index,
    isActive,
    onUpdate,
    onDelete,
    onSplit,
    onSeek,
}: {
    line: SubtitleLine;
    index: number;
    isActive: boolean;
    onUpdate: (id: string, field: keyof SubtitleLine, value: any) => void;
    onDelete: (id: string) => void;
    onSplit: (id: string) => void;
    onSeek: (time: number) => void;
}) {
    const [startInput, setStartInput] = useState(formatTime(line.start));
    const [endInput, setEndInput] = useState(formatTime(line.end));
    const [startError, setStartError] = useState(false);
    const [endError, setEndError] = useState(false);

    // Sync inputs when line changes from parent
    useEffect(() => {
        setStartInput(formatTime(line.start));
        setEndInput(formatTime(line.end));
    }, [line.start, line.end]);

    const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setStartInput(val);
        const parsed = parseTime(val);
        if (parsed !== null && parsed >= 0 && parsed < line.end) {
            setStartError(false);
            onUpdate(line.id, 'start', parsed);
        } else {
            setStartError(true);
        }
    };

    const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setEndInput(val);
        const parsed = parseTime(val);
        if (parsed !== null && parsed > line.start) {
            setEndError(false);
            onUpdate(line.id, 'end', parsed);
        } else {
            setEndError(true);
        }
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onUpdate(line.id, 'text', e.target.value);
    };

    const handleRowClick = () => {
        onSeek(line.start);
    };

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Delete this subtitle line?')) {
            onDelete(line.id);
        }
    };

    const handleSplitClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSplit(line.id);
    };

    return (
        <div
            className={`
                border rounded-lg p-3 mb-2 cursor-pointer transition-all duration-200
                ${isActive
                    ? 'border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-300'
                    : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300'
                }
            `}
            onClick={handleRowClick}
        >
            {/* Row header */}
            <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold ${isActive ? 'text-blue-700' : 'text-gray-500'}`}>
                    #{index + 1}
                </span>

                {/* Time inputs */}
                <div className="flex items-center gap-1">
                    <input
                        type="text"
                        value={startInput}
                        onChange={handleStartChange}
                        onClick={(e) => e.stopPropagation()}
                        className={`
                            w-20 px-2 py-1 text-xs font-mono border rounded text-center
                            ${startError ? 'border-red-400 bg-red-50' : 'border-gray-300'}
                            focus:outline-none focus:ring-1 focus:ring-blue-400
                        `}
                        placeholder="00:00.00"
                    />
                    <span className="text-gray-400 text-xs">→</span>
                    <input
                        type="text"
                        value={endInput}
                        onChange={handleEndChange}
                        onClick={(e) => e.stopPropagation()}
                        className={`
                            w-20 px-2 py-1 text-xs font-mono border rounded text-center
                            ${endError ? 'border-red-400 bg-red-50' : 'border-gray-300'}
                            focus:outline-none focus:ring-1 focus:ring-blue-400
                        `}
                        placeholder="00:00.00"
                    />
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleSplitClick}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded transition"
                        title="Split at current time"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M8 12h8m-8 5h8M4 7h0m0 5h0m0 5h0" />
                        </svg>
                    </button>
                    <button
                        onClick={handleDeleteClick}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded transition"
                        title="Delete"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Text editor */}
            <textarea
                value={line.text}
                onChange={handleTextChange}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                rows={2}
                placeholder="Enter subtitle text..."
            />

            {/* Duration */}
            <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                <span>Duration: {(line.end - line.start).toFixed(2)}s</span>
                {isActive && <span className="text-blue-600 font-medium">▶ Playing</span>}
            </div>
        </div>
    );
});

export default function SubtitleEditor({
    clipId,
    language,
    initialSegments,
    onSubtitlesChange,
    currentTime
}: SubtitleEditorProps) {
    // Convert initial segments to SubtitleLine with IDs
    const [lines, setLines] = useState<SubtitleLine[]>(() =>
        initialSegments.map((seg, idx) => ({
            ...seg,
            id: generateId(),
        }))
    );

    const containerRef = useRef<HTMLDivElement>(null);
    const activeLineRef = useRef<HTMLDivElement>(null);

    // Update when initialSegments change (e.g., language switch)
    useEffect(() => {
        setLines(initialSegments.map((seg) => ({
            ...seg,
            id: generateId(),
        })));
    }, [initialSegments]);

    // Find active line based on current time
    const activeIndex = lines.findIndex(
        (line) => currentTime >= line.start && currentTime < line.end
    );

    // Propagate changes to parent (without IDs)
    const propagateChanges = useCallback((newLines: SubtitleLine[]) => {
        const segments: SubtitleSegment[] = newLines.map(({ start, end, text }) => ({ start, end, text }));
        onSubtitlesChange(segments);
    }, [onSubtitlesChange]);

    // Handle field update
    const handleUpdate = useCallback((id: string, field: keyof SubtitleLine, value: any) => {
        setLines(prev => {
            const newLines = prev.map(line =>
                line.id === id ? { ...line, [field]: value } : line
            );
            propagateChanges(newLines);
            return newLines;
        });
    }, [propagateChanges]);

    // Handle delete
    const handleDelete = useCallback((id: string) => {
        setLines(prev => {
            const newLines = prev.filter(line => line.id !== id);
            propagateChanges(newLines);
            return newLines;
        });
    }, [propagateChanges]);

    // Handle split at current video time
    const handleSplit = useCallback((id: string) => {
        setLines(prev => {
            const idx = prev.findIndex(line => line.id === id);
            if (idx === -1) return prev;

            const line = prev[idx];
            const splitTime = currentTime;

            // Validate split time is within the line's range
            if (splitTime <= line.start || splitTime >= line.end) {
                alert('Cannot split: video position must be within the subtitle time range.');
                return prev;
            }

            // Create two new lines
            const line1: SubtitleLine = {
                id: generateId(),
                start: line.start,
                end: splitTime,
                text: line.text,
            };
            const line2: SubtitleLine = {
                id: generateId(),
                start: splitTime,
                end: line.end,
                text: '',
            };

            const newLines = [...prev.slice(0, idx), line1, line2, ...prev.slice(idx + 1)];
            propagateChanges(newLines);
            return newLines;
        });
    }, [currentTime, propagateChanges]);

    // Handle add new line
    const handleAddLine = useCallback(() => {
        const newLine: SubtitleLine = {
            id: generateId(),
            start: currentTime,
            end: currentTime + 2,
            text: '',
        };
        setLines(prev => {
            // Insert in sorted order by start time
            const insertIdx = prev.findIndex(line => line.start > currentTime);
            const newLines = insertIdx === -1
                ? [...prev, newLine]
                : [...prev.slice(0, insertIdx), newLine, ...prev.slice(insertIdx)];
            propagateChanges(newLines);
            return newLines;
        });
    }, [currentTime, propagateChanges]);

    // Handle seek to timeline
    const handleSeek = useCallback((time: number) => {
        const seekEvent = new CustomEvent('subtitle-seek', { detail: { time } });
        window.dispatchEvent(seekEvent);
    }, []);

    // Auto-scroll to active line
    useEffect(() => {
        if (activeLineRef.current && containerRef.current) {
            const container = containerRef.current;
            const activeElement = activeLineRef.current;

            const containerRect = container.getBoundingClientRect();
            const activeRect = activeElement.getBoundingClientRect();

            if (activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom) {
                activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [activeIndex]);

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b shadow-sm">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">
                        Subtitle Editor
                    </h3>
                    <p className="text-xs text-gray-500">
                        {lines.length} lines • {language.toUpperCase()}
                    </p>
                </div>

                <button
                    onClick={handleAddLine}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition shadow-sm"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Line
                </button>
            </div>

            {/* Current time indicator */}
            <div className="px-4 py-2 bg-gray-100 border-b text-xs font-mono text-gray-600 flex items-center gap-2">
                <span className="text-red-500">●</span>
                Current: {formatTime(currentTime)}
                <span className="text-gray-400 ml-2">• Click a line to seek video</span>
            </div>

            {/* Subtitle list */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto p-4"
            >
                {lines.length > 0 ? (
                    lines.map((line, index) => (
                        <div
                            key={line.id}
                            ref={index === activeIndex ? activeLineRef : null}
                        >
                            <SubtitleLineRow
                                line={line}
                                index={index}
                                isActive={index === activeIndex}
                                onUpdate={handleUpdate}
                                onDelete={handleDelete}
                                onSplit={handleSplit}
                                onSeek={handleSeek}
                            />
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-16 h-16 mb-4 rounded-full bg-gray-200 flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                        </div>
                        <h4 className="text-lg font-medium text-gray-700 mb-2">
                            No subtitles yet
                        </h4>
                        <p className="text-sm text-gray-500 mb-4">
                            Add a subtitle line to begin editing.
                        </p>
                        <button
                            onClick={handleAddLine}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                            + Add First Subtitle
                        </button>
                    </div>
                )}
            </div>

            {/* Footer stats */}
            {lines.length > 0 && (
                <div className="px-4 py-2 bg-white border-t text-xs text-gray-500 flex items-center justify-between">
                    <span>
                        Total duration: {lines.length > 0 ? formatTime(Math.max(...lines.map(l => l.end))) : '00:00.00'}
                    </span>
                    <span>
                        {lines.filter(l => l.text.trim() === '').length} empty lines
                    </span>
                </div>
            )}
        </div>
    );
}
