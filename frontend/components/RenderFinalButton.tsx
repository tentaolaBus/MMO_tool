'use client';

import React, { useState } from 'react';
import { SubtitleStyle } from '../lib/types';

interface RenderFinalButtonProps {
    clipId: string;
    language: string;
    subtitleStyle?: SubtitleStyle;
    subtitleEnabled?: boolean;
    onRenderStart: () => void;
    onRenderComplete: (videoUrl: string) => void;
    onError: (error: string) => void;
}

export default function RenderFinalButton({
    clipId,
    language,
    subtitleStyle,
    subtitleEnabled = true,
    onRenderStart,
    onRenderComplete,
    onError
}: RenderFinalButtonProps) {
    const [rendering, setRendering] = useState(false);
    const [progress, setProgress] = useState(0);

    const handleRender = async () => {
        setRendering(true);
        setProgress(0);
        onRenderStart();

        try {
            const { renderFinalVideo } = await import('../lib/api');

            // Simulate progress (FFmpeg doesn't give real-time progress easily)
            const progressInterval = setInterval(() => {
                setProgress((prev) => Math.min(prev + 10, 90));
            }, 1000);

            const result = await renderFinalVideo(clipId, language, subtitleStyle, subtitleEnabled);

            clearInterval(progressInterval);
            setProgress(100);

            if (result.success) {
                setTimeout(() => {
                    onRenderComplete(result.finalVideoUrl);
                    setRendering(false);
                    setProgress(0);
                }, 500);
            } else {
                throw new Error('Render failed');
            }

        } catch (error: any) {
            console.error('Render error:', error);
            onError(error.message || 'Failed to render final video');
            setRendering(false);
            setProgress(0);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <button
                onClick={handleRender}
                disabled={rendering}
                className={`
                    px-6 py-3 rounded-lg font-semibold text-white transition
                    ${rendering
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 shadow-lg hover:shadow-xl'
                    }
                `}
            >
                {rendering ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Rendering… {progress}%
                    </span>
                ) : (
                    `🎬 Render Final Video${subtitleEnabled ? '' : ' (No Subs)'}`
                )}
            </button>

            {rendering && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}
        </div>
    );
}
