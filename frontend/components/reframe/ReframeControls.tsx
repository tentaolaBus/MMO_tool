'use client';

import { Download, RotateCcw, Loader2, CheckCircle2, AlertCircle, ScanFace, Radar, Hand } from 'lucide-react';
import type { OutputRatio, ReframeProgress, AIMode, ZoomStyle } from '@/features/video-reframing/types';
import { RATIO_OPTIONS } from '@/features/video-reframing/types';

interface ReframeControlsProps {
    /** Selected output ratio */
    ratio: OutputRatio;
    /** AI mode */
    aiMode: AIMode;
    /** Zoom style */
    zoomStyle: ZoomStyle;
    /** Focus subject */
    focusSubjectId: 'auto' | string;
    /** Current status */
    status: 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';
    /** Whether a file is selected */
    hasFile: boolean;
    /** Progress data */
    progress: ReframeProgress | null;
    /** Error message */
    error: string | null;
    /** Whether download is ready */
    downloadReady: boolean;
    /** Callbacks */
    onRatioChange: (ratio: OutputRatio) => void;
    onAIModeChange: (mode: AIMode) => void;
    onZoomStyleChange: (style: ZoomStyle) => void;
    onFocusSubjectChange: (id: 'auto' | string) => void;
    onProcess: () => void;
    onDownload: () => void;
    onReset: () => void;
}

export default function ReframeControls({
    ratio,
    aiMode,
    zoomStyle,
    focusSubjectId,
    status,
    hasFile,
    progress,
    error,
    downloadReady,
    onRatioChange,
    onAIModeChange,
    onZoomStyleChange,
    onFocusSubjectChange,
    onProcess,
    onDownload,
    onReset,
}: ReframeControlsProps) {
    const isProcessing = status === 'uploading' || status === 'processing';

    return (
        <div className="space-y-5">
            {/* ─── AI Mode ─── */}
            <div>
                <label className="block text-sm font-semibold text-foreground mb-2.5">
                    AI Mode
                </label>
                <div className="grid grid-cols-1 gap-2">
                    <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => onAIModeChange('tracking')}
                        className={`
                            flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 text-left
                            disabled:opacity-50 disabled:cursor-not-allowed
                            ${aiMode === 'tracking'
                                ? 'border-purple-500 bg-purple-500/10'
                                : 'border-border hover:border-purple-400/40 hover:bg-muted/40'}
                        `}
                    >
                        <div className={`size-8 rounded-lg flex items-center justify-center ${aiMode === 'tracking' ? 'bg-purple-500/15 text-purple-500' : 'bg-muted text-muted-foreground'}`}>
                            <Radar className="size-4" />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-semibold text-foreground">AI Tracking</div>
                            <div className="text-[11px] text-muted-foreground">Recommended — smooth subject tracking</div>
                        </div>
                        {aiMode === 'tracking' && <span className="text-[11px] font-bold text-purple-500">ON</span>}
                    </button>

                    <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => onAIModeChange('face')}
                        className={`
                            flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 text-left
                            disabled:opacity-50 disabled:cursor-not-allowed
                            ${aiMode === 'face'
                                ? 'border-purple-500 bg-purple-500/10'
                                : 'border-border hover:border-purple-400/40 hover:bg-muted/40'}
                        `}
                    >
                        <div className={`size-8 rounded-lg flex items-center justify-center ${aiMode === 'face' ? 'bg-purple-500/15 text-purple-500' : 'bg-muted text-muted-foreground'}`}>
                            <ScanFace className="size-4" />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-semibold text-foreground">Face Focus</div>
                            <div className="text-[11px] text-muted-foreground">Prefer faces when available</div>
                        </div>
                        {aiMode === 'face' && <span className="text-[11px] font-bold text-purple-500">ON</span>}
                    </button>

                    <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => onAIModeChange('manual')}
                        className={`
                            flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 text-left
                            disabled:opacity-50 disabled:cursor-not-allowed
                            ${aiMode === 'manual'
                                ? 'border-purple-500 bg-purple-500/10'
                                : 'border-border hover:border-purple-400/40 hover:bg-muted/40'}
                        `}
                    >
                        <div className={`size-8 rounded-lg flex items-center justify-center ${aiMode === 'manual' ? 'bg-purple-500/15 text-purple-500' : 'bg-muted text-muted-foreground'}`}>
                            <Hand className="size-4" />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-semibold text-foreground">Manual Adjust</div>
                            <div className="text-[11px] text-muted-foreground">You control the crop position</div>
                        </div>
                        {aiMode === 'manual' && <span className="text-[11px] font-bold text-purple-500">ON</span>}
                    </button>
                </div>
            </div>

            {/* ─── Ratio Selector ─── */}
            <div>
                <label className="block text-sm font-semibold text-foreground mb-2.5">
                    Output Ratio
                </label>
                <div className="grid grid-cols-3 gap-2">
                    {RATIO_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => onRatioChange(opt.value)}
                            disabled={isProcessing}
                            className={`
                                relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200
                                disabled:opacity-50 disabled:cursor-not-allowed
                                ${ratio === opt.value
                                    ? 'border-purple-500 bg-purple-500/10 shadow-sm'
                                    : 'border-border hover:border-purple-400/40 hover:bg-muted/50'
                                }
                            `}
                        >
                            {/* Visual ratio indicator */}
                            <div className="flex items-center justify-center h-10">
                                <div
                                    className={`border-2 rounded-sm transition-colors ${
                                        ratio === opt.value ? 'border-purple-500' : 'border-muted-foreground/40'
                                    }`}
                                    style={{
                                        width: opt.value === '9:16' ? 18 : opt.value === '1:1' ? 24 : 20,
                                        height: opt.value === '9:16' ? 32 : opt.value === '1:1' ? 24 : 25,
                                    }}
                                />
                            </div>
                            <span className={`text-xs font-bold ${
                                ratio === opt.value ? 'text-purple-500' : 'text-muted-foreground'
                            }`}>
                                {opt.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground leading-tight text-center">
                                {opt.description}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ─── Zoom Style ─── */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-sm font-semibold text-foreground mb-2.5">
                        Zoom Style
                    </label>
                    <select
                        value={zoomStyle}
                        disabled={isProcessing}
                        onChange={(e) => onZoomStyleChange(e.target.value as ZoomStyle)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                    >
                        <option value="smooth">Smooth tracking</option>
                        <option value="dynamic">Dynamic zoom</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-foreground mb-2.5">
                        Focus
                    </label>
                    <select
                        value={focusSubjectId}
                        disabled={isProcessing}
                        onChange={(e) => onFocusSubjectChange(e.target.value as any)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                    >
                        <option value="auto">Auto</option>
                        {/* If backend later exposes subjects, we can render them here */}
                    </select>
                </div>
            </div>

            {/* Small inline status (main progress is in bottom panel) */}
            {progress && isProcessing && (
                <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/40 border border-border rounded-xl px-3 py-2">
                    <span className="flex items-center gap-2">
                        <Loader2 className="size-3.5 animate-spin text-purple-500" />
                        {progress.message}
                    </span>
                    <span className="font-bold text-purple-400">{progress.percent}%</span>
                </div>
            )}

            {/* ─── Completed State ─── */}
            {status === 'completed' && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                    <CheckCircle2 className="size-5 text-green-500" />
                    <span className="text-sm text-green-500 font-medium">
                        Reframing complete! Ready to download.
                    </span>
                </div>
            )}

            {/* ─── Error State ─── */}
            {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="size-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-red-400">{error}</span>
                </div>
            )}

            {/* ─── Action Buttons ─── */}
            <div className="flex gap-3">
                {status === 'completed' && downloadReady ? (
                    <>
                        <button
                            onClick={onDownload}
                            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl
                                bg-gradient-to-r from-purple-600 to-pink-600
                                hover:from-purple-500 hover:to-pink-500
                                text-white font-semibold text-sm
                                transition-all duration-200 shadow-md hover:shadow-lg
                                active:scale-[0.98]"
                        >
                            <Download className="size-4" />
                            Download Reframed Video
                        </button>
                        <button
                            onClick={onReset}
                            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl
                                border-2 border-border text-muted-foreground hover:text-foreground
                                hover:border-purple-400/40 font-medium text-sm
                                transition-all duration-200"
                        >
                            <RotateCcw className="size-4" />
                            New
                        </button>
                    </>
                ) : (
                    <button
                        onClick={isProcessing ? undefined : onProcess}
                        disabled={!hasFile || isProcessing}
                        className={`
                            flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl
                            font-semibold text-sm transition-all duration-200 shadow-md
                            active:scale-[0.98]
                            ${!hasFile || isProcessing
                                ? 'bg-muted text-muted-foreground cursor-not-allowed shadow-none'
                                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white hover:shadow-lg'
                            }
                        `}
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                {status === 'uploading' ? 'Uploading...' : 'Processing...'}
                            </>
                        ) : (
                            'Reframe Video'
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}
