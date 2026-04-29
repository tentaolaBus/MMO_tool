'use client';

import { Loader2 } from 'lucide-react';

interface ClipperProgressProps {
    percent: number;
    stage: string;
    message: string;
}

const STAGES = ['uploading', 'transcribing', 'analyzing', 'generating', 'rendering', 'completed'];

export default function ClipperProgress({ percent, stage, message }: ClipperProgressProps) {
    const stageIdx = STAGES.indexOf(stage);

    return (
        <div className="flex flex-col items-center justify-center py-16 px-8">
            {/* Spinner */}
            <div className="relative mb-8">
                <div className="size-24 rounded-full border-4 border-muted flex items-center justify-center">
                    <span className="text-2xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                        {percent}%
                    </span>
                </div>
                <svg className="absolute inset-0 size-24 -rotate-90" viewBox="0 0 96 96">
                    <circle
                        cx="48" cy="48" r="44"
                        fill="none" stroke="url(#progressGrad)" strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 44}`}
                        strokeDashoffset={`${2 * Math.PI * 44 * (1 - percent / 100)}`}
                        className="transition-all duration-700 ease-out"
                    />
                    <defs>
                        <linearGradient id="progressGrad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#a855f7" />
                            <stop offset="100%" stopColor="#ec4899" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>

            {/* Message */}
            <div className="flex items-center gap-2 text-sm text-purple-500 mb-4">
                <Loader2 className="size-4 animate-spin" />
                {message}
            </div>

            {/* Stage indicators */}
            <div className="flex items-center gap-1 mt-2">
                {STAGES.slice(0, -1).map((s, i) => (
                    <div key={s} className="flex items-center gap-1">
                        <div className={`size-2 rounded-full transition-colors duration-500 ${
                            i <= stageIdx ? 'bg-purple-500' : 'bg-muted'
                        }`} />
                        {i < STAGES.length - 2 && (
                            <div className={`w-6 h-0.5 transition-colors duration-500 ${
                                i < stageIdx ? 'bg-purple-500' : 'bg-muted'
                            }`} />
                        )}
                    </div>
                ))}
            </div>
            <div className="flex justify-between w-full max-w-xs mt-1.5">
                {STAGES.slice(0, -1).map((s) => (
                    <span key={s} className="text-[9px] text-muted-foreground capitalize">{s}</span>
                ))}
            </div>
        </div>
    );
}
