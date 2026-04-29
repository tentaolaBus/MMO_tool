'use client';

import { Crosshair, Hand, Download, RotateCcw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { OutputRatio, ReframeProgress } from '@/features/video-reframing/types';
import { RATIO_OPTIONS } from '@/features/video-reframing/types';

interface ReframeControlsProps {
    /** Selected output ratio */
    ratio: OutputRatio;
    /** Whether auto-center is active */
    autoCenter: boolean;
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
    onToggleAutoCenter: () => void;
    onProcess: () => void;
    onDownload: () => void;
    onReset: () => void;
}

export default function ReframeControls({
    ratio,
    autoCenter,
    status,
    hasFile,
    progress,
    error,
    downloadReady,
    onRatioChange,
    onToggleAutoCenter,
    onProcess,
    onDownload,
    onReset,
}: ReframeControlsProps) {
    const isProcessing = status === 'uploading' || status === 'processing';

    return (
        <div className="space-y-5">
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

            {/* ─── Crop Mode Toggle ─── */}
            <div>
                <label className="block text-sm font-semibold text-foreground mb-2.5">
                    Crop Mode
                </label>
                <div className="flex gap-2">
                    <button
                        onClick={() => { if (!autoCenter) onToggleAutoCenter(); }}
                        disabled={isProcessing}
                        className={`
                            flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 text-sm font-medium
                            transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                            ${autoCenter
                                ? 'border-purple-500 bg-purple-500/10 text-purple-500'
                                : 'border-border text-muted-foreground hover:border-purple-400/40'
                            }
                        `}
                    >
                        <Crosshair className="size-4" />
                        Auto Center
                    </button>
                    <button
                        onClick={() => { if (autoCenter) onToggleAutoCenter(); }}
                        disabled={isProcessing}
                        className={`
                            flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 text-sm font-medium
                            transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                            ${!autoCenter
                                ? 'border-purple-500 bg-purple-500/10 text-purple-500'
                                : 'border-border text-muted-foreground hover:border-purple-400/40'
                            }
                        `}
                    >
                        <Hand className="size-4" />
                        Manual Adjust
                    </button>
                </div>
            </div>

            {/* ─── Progress Bar ─── */}
            {progress && isProcessing && (
                <div className="space-y-2 p-4 rounded-xl bg-muted/50 border border-border">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-purple-500 flex items-center gap-2">
                            <Loader2 className="size-4 animate-spin" />
                            {progress.message}
                        </span>
                        <span className="font-bold text-purple-400">{progress.percent}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                        <div
                            className="h-2.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-700 ease-out"
                            style={{ width: `${progress.percent}%` }}
                        />
                    </div>
                    <p className="text-[11px] text-muted-foreground capitalize">
                        Stage: {progress.stage.replace(/_/g, ' ')}
                    </p>
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
