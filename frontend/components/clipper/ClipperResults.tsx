'use client';

import { useState } from 'react';
import { Download, Play, Pause, Crop, Type, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import type { Clip } from '@/lib/types';

interface ClipperResultsProps {
    clips: Clip[];
    selectedClips: Set<string>;
    onToggleClip: (id: string) => void;
    onToggleAll: () => void;
    onDownload: () => void;
    downloading: boolean;
    backendUrl: string;
}

export default function ClipperResults({
    clips, selectedClips, onToggleClip, onToggleAll, onDownload, downloading, backendUrl,
}: ClipperResultsProps) {
    const allSelected = clips.length > 0 && clips.every(c => selectedClips.has(c.id));

    if (clips.length === 0) return null;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-foreground">
                        Generated Clips
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                            {clips.length} clip{clips.length !== 1 ? 's' : ''}
                        </span>
                    </h2>
                </div>
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <input
                            type="checkbox" checked={allSelected} onChange={onToggleAll}
                            className="size-4 rounded border-border accent-purple-500"
                        />
                        Select All
                    </label>
                </div>
            </div>

            {/* Clips Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {clips.map((clip) => (
                    <ClipCard
                        key={clip.id}
                        clip={clip}
                        selected={selectedClips.has(clip.id)}
                        onToggle={onToggleClip}
                        backendUrl={backendUrl}
                    />
                ))}
            </div>

            {/* Download Bar */}
            {selectedClips.size > 0 && (
                <div className="sticky bottom-4 bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-4 shadow-lg flex items-center justify-between">
                    <span className="text-sm text-foreground font-medium">
                        {selectedClips.size} clip{selectedClips.size !== 1 ? 's' : ''} selected
                    </span>
                    <button
                        onClick={onDownload}
                        disabled={downloading}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                        {downloading ? (
                            <><div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Downloading...</>
                        ) : (
                            <><Download className="size-4" /> Download {selectedClips.size > 1 ? 'ZIP' : 'Clip'}</>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}

/* ─── Individual Clip Card ─── */

function ClipCard({ clip, selected, onToggle, backendUrl }: {
    clip: Clip; selected: boolean; onToggle: (id: string) => void; backendUrl: string;
}) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const cacheBuster = clip.updatedAt ? `?v=${new Date(clip.updatedAt).getTime()}` : '';
    const videoSrc = (clip.videoUrl?.startsWith('http') ? clip.videoUrl : `${backendUrl}${clip.videoUrl}`) + cacheBuster;
    const score = clip.score?.total || 0;
    const duration = clip.duration ? `${Math.round(clip.duration)}s` : '';

    const scoreColor = score >= 80 ? 'text-green-500 bg-green-500/10' : score >= 60 ? 'text-amber-500 bg-amber-500/10' : 'text-muted-foreground bg-muted';

    return (
        <div className={`
            bg-card rounded-2xl border-2 overflow-hidden transition-all duration-200 group
            ${selected ? 'border-purple-500 shadow-md shadow-purple-500/10' : 'border-border hover:border-purple-400/30'}
        `}>
            {/* Video */}
            <div className="relative bg-black aspect-video cursor-pointer"
                onClick={() => setIsPlaying(!isPlaying)}
                onMouseEnter={() => setIsPlaying(true)}
                onMouseLeave={() => setIsPlaying(false)}>
                <video
                    key={videoSrc} src={videoSrc}
                    className="w-full h-full object-contain" loop muted playsInline
                    ref={(v) => {
                        if (v) { isPlaying ? v.play().catch(() => {}) : (v.pause(), v.currentTime = 0); }
                    }}
                />
                {!isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition">
                        <div className="size-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                            <Play className="size-5 text-purple-600 ml-0.5" fill="currentColor" />
                        </div>
                    </div>
                )}
                {/* Score badge */}
                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold ${scoreColor}`}>
                    {score}/100
                </div>
                {/* Duration */}
                {duration && (
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white font-medium">
                        {duration}
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-3.5 space-y-2.5">
                {/* Header row */}
                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={selected} onChange={() => onToggle(clip.id)}
                            className="size-4 rounded border-border accent-purple-500" />
                        <span className="text-sm font-semibold text-foreground">Clip #{clip.clipIndex + 1}</span>
                    </label>
                </div>

                {/* Text excerpt */}
                {clip.text && (
                    <p className="text-xs text-muted-foreground line-clamp-2 italic leading-relaxed">
                        &quot;{clip.text}&quot;
                    </p>
                )}

                {/* Quick actions */}
                <div className="flex items-center gap-2 pt-1">
                    <Link href="/reframe" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-blue-500 hover:border-blue-400/40 transition-all">
                        <Crop className="size-3" /> Reframe
                    </Link>
                    <Link href="/subtitles" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-amber-500 hover:border-amber-400/40 transition-all">
                        <Type className="size-3" /> Subtitles
                    </Link>
                </div>

                {/* Expandable score details */}
                {clip.score && (
                    <div>
                        <button onClick={() => setExpanded(!expanded)}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            Score breakdown
                        </button>
                        {expanded && (
                            <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-lg">
                                <div className="flex justify-between"><span>Duration fit</span><span className="font-medium">{clip.score.durationScore}/40</span></div>
                                <div className="flex justify-between"><span>Keywords</span><span className="font-medium">{clip.score.keywordScore}/30</span></div>
                                <div className="flex justify-between"><span>Completeness</span><span className="font-medium">{clip.score.completenessScore}/30</span></div>
                                {clip.score.keywords?.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {clip.score.keywords.slice(0, 4).map((kw, i) => (
                                            <span key={i} className="px-1.5 py-0.5 bg-purple-500/10 text-purple-500 rounded text-[10px]">{kw}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
