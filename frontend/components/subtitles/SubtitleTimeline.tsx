'use client';

import { useCallback } from 'react';
import { Clock, Trash2, Plus } from 'lucide-react';
import type { SubtitleSegment } from '@/features/video-subtitles/types';

interface SubtitleTimelineProps {
    segments: SubtitleSegment[];
    currentTime: number;
    onSegmentClick: (segment: SubtitleSegment) => void;
    onUpdateSegment: (id: string, updates: Partial<SubtitleSegment>) => void;
    onDeleteSegment: (id: string) => void;
    onAddSegment: (afterId?: string) => void;
    disabled?: boolean;
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export default function SubtitleTimeline({
    segments,
    currentTime,
    onSegmentClick,
    onUpdateSegment,
    onDeleteSegment,
    onAddSegment,
    disabled,
}: SubtitleTimelineProps) {
    const handleTextChange = useCallback((id: string, text: string) => {
        onUpdateSegment(id, { text });
    }, [onUpdateSegment]);

    const handleTimeChange = useCallback((id: string, field: 'start' | 'end', value: string) => {
        const num = parseFloat(value);
        if (!isNaN(num) && num >= 0) {
            onUpdateSegment(id, { [field]: num });
        }
    }, [onUpdateSegment]);

    if (segments.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="size-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-3">
                    <Clock className="size-6 text-amber-500" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">No subtitles yet</p>
                <p className="text-xs text-muted-foreground">Upload a video and click &quot;Generate Subtitles&quot; to start</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between px-1 mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {segments.length} segment{segments.length !== 1 ? 's' : ''}
                </span>
                <button
                    onClick={() => onAddSegment()}
                    disabled={disabled}
                    className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 transition-colors disabled:opacity-50"
                >
                    <Plus className="size-3" /> Add
                </button>
            </div>

            {/* Segment List */}
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                {segments.map((seg, idx) => {
                    const isActive = currentTime >= seg.start && currentTime <= seg.end;

                    return (
                        <div
                            key={seg.id}
                            onClick={() => onSegmentClick(seg)}
                            className={`
                                group relative p-3 rounded-xl border transition-all duration-200 cursor-pointer
                                ${isActive
                                    ? 'border-amber-500/50 bg-amber-500/5 shadow-sm'
                                    : 'border-border hover:border-amber-400/30 hover:bg-muted/30'
                                }
                            `}
                        >
                            {/* Index badge */}
                            <div className="flex items-start gap-2.5">
                                <span className={`
                                    flex-shrink-0 size-6 rounded-md flex items-center justify-center text-[10px] font-bold mt-0.5
                                    ${isActive ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground'}
                                `}>
                                    {idx + 1}
                                </span>

                                <div className="flex-1 min-w-0">
                                    {/* Text input */}
                                    <textarea
                                        value={seg.text}
                                        onChange={(e) => handleTextChange(seg.id, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        disabled={disabled}
                                        rows={1}
                                        className="w-full bg-transparent text-sm text-foreground resize-none focus:outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
                                        placeholder="Enter subtitle text..."
                                        style={{ minHeight: '1.5rem' }}
                                        onInput={(e) => {
                                            const target = e.target as HTMLTextAreaElement;
                                            target.style.height = 'auto';
                                            target.style.height = target.scrollHeight + 'px';
                                        }}
                                    />

                                    {/* Timing row */}
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <div className="flex items-center gap-1">
                                            <Clock className="size-3 text-muted-foreground" />
                                            <input
                                                type="number"
                                                value={seg.start.toFixed(2)}
                                                onChange={(e) => handleTimeChange(seg.id, 'start', e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                disabled={disabled}
                                                step="0.1"
                                                min="0"
                                                className="w-16 bg-muted/50 text-[11px] text-muted-foreground rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-500/50 disabled:opacity-50"
                                            />
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">→</span>
                                        <input
                                            type="number"
                                            value={seg.end.toFixed(2)}
                                            onChange={(e) => handleTimeChange(seg.id, 'end', e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            disabled={disabled}
                                            step="0.1"
                                            min="0"
                                            className="w-16 bg-muted/50 text-[11px] text-muted-foreground rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-500/50 disabled:opacity-50"
                                        />
                                        <span className="text-[10px] text-muted-foreground/60 ml-auto">
                                            {formatTime(seg.start)} — {formatTime(seg.end)}
                                        </span>
                                    </div>
                                </div>

                                {/* Delete button */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDeleteSegment(seg.id); }}
                                    disabled={disabled}
                                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 text-muted-foreground hover:text-red-400 transition-all disabled:opacity-50"
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
