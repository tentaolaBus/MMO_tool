'use client';

import { Scissors, Loader2, Sparkles } from 'lucide-react';

interface ClipperSettingsProps {
    clipDuration: number;
    onDurationChange: (d: number) => void;
    onGenerate: () => void;
    hasFile: boolean;
    isProcessing: boolean;
}

const DURATIONS = [
    { value: 15, label: '15s', desc: 'TikTok' },
    { value: 30, label: '30s', desc: 'Reels' },
    { value: 60, label: '60s', desc: 'Shorts' },
    { value: 90, label: '90s', desc: 'Long' },
];

export default function ClipperSettings({
    clipDuration, onDurationChange,
    onGenerate, hasFile, isProcessing,
}: ClipperSettingsProps) {
    return (
        <div className="space-y-6">
            {/* Clip Duration */}
            <div>
                <label className="block text-sm font-semibold text-foreground mb-2.5">Clip Duration</label>
                <div className="grid grid-cols-4 gap-2">
                    {DURATIONS.map((d) => (
                        <button
                            key={d.value}
                            onClick={() => onDurationChange(d.value)}
                            disabled={isProcessing}
                            className={`
                                flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-xl border-2 transition-all duration-200
                                disabled:opacity-50 disabled:cursor-not-allowed
                                ${clipDuration === d.value
                                    ? 'border-purple-500 bg-purple-500/10'
                                    : 'border-border hover:border-purple-400/40 hover:bg-muted/50'
                                }
                            `}
                        >
                            <span className={`text-sm font-bold ${clipDuration === d.value ? 'text-purple-500' : 'text-foreground'}`}>
                                {d.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{d.desc}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Generate Button */}
            <button
                onClick={onGenerate}
                disabled={!hasFile || isProcessing}
                className={`
                    w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl
                    font-semibold text-sm transition-all duration-200 shadow-md active:scale-[0.98]
                    ${!hasFile || isProcessing
                        ? 'bg-muted text-muted-foreground cursor-not-allowed shadow-none'
                        : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white hover:shadow-lg'
                    }
                `}
            >
                {isProcessing ? (
                    <><Loader2 className="size-4 animate-spin" /> Processing...</>
                ) : (
                    <><Sparkles className="size-4" /> Generate Clips</>
                )}
            </button>
        </div>
    );
}
