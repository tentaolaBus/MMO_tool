'use client';

import React, { useState } from 'react';
import { Clip } from '../lib/types';

interface ClipItemProps {
    clip: Clip;
    selected: boolean;
    onToggle: (clipId: string) => void;
    onPreview: (clip: Clip) => void;
    backendUrl: string;
}

export default function ClipItem({ clip, selected, onToggle, onPreview, backendUrl }: ClipItemProps) {
    const [isPlaying, setIsPlaying] = useState(false);

    const videoSrc = `${backendUrl}${clip.videoUrl}`;
    const duration = clip.duration ? `${Math.round(clip.duration)}s` : 'N/A';
    const score = clip.score?.total || 0;

    return (
        <div className={`bg-white rounded-lg shadow-md overflow-hidden border-2 transition-all ${selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
            }`}>
            {/* Header with checkbox and score */}
            <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
                <label className="flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggle(clip.id)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="ml-2 font-semibold text-gray-700">
                        Clip #{clip.clipIndex + 1}
                    </span>
                </label>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">⏱ {duration}</span>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${score >= 80 ? 'bg-green-100 text-green-800' :
                        score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                        }`}>
                        {score}/100
                    </span>
                </div>
            </div>

            {/* Video Preview */}
            <div
                className="relative bg-black aspect-video cursor-pointer group"
                onClick={() => onPreview(clip)}
                onMouseEnter={() => setIsPlaying(true)}
                onMouseLeave={() => setIsPlaying(false)}
            >
                <video
                    src={videoSrc}
                    className="w-full h-full object-contain"
                    loop
                    muted
                    playsInline
                    ref={(video) => {
                        if (video) {
                            if (isPlaying) {
                                video.play().catch(() => { });
                            } else {
                                video.pause();
                                video.currentTime = 0;
                            }
                        }
                    }}
                />
                {!isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 group-hover:bg-opacity-20 transition">
                        <div className="bg-white rounded-full p-4 shadow-lg">
                            <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                        </div>
                    </div>
                )}
            </div>

            {/* Preview Button */}
            <button
                onClick={() => onPreview(clip)}
                className="w-full px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition font-medium text-sm"
            >
                🎬 Preview with Subtitles
            </button>

            {/* Edit Subtitles Button */}
            <a
                href={`/job/${clip.jobId}/edit/${clip.jobId}_${clip.clipIndex}`}
                className="block w-full px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 transition font-medium text-sm text-center"
            >
                ✏️ Edit Subtitles
            </a>

            {/* Clip Details */}
            {clip.score && (
                <div className="p-3 space-y-2 text-sm">
                    {/* Text Preview */}
                    {clip.text && (
                        <p className="text-gray-700 line-clamp-2 italic">
                            &quot;{clip.text}&quot;
                        </p>
                    )}

                    {/* Score Breakdown */}
                    <div className="space-y-1 text-xs text-gray-600">
                        <div className="flex justify-between">
                            <span>Duration fit:</span>
                            <span className="font-medium">{clip.score.durationScore}/40</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Keywords:</span>
                            <span className="font-medium">{clip.score.keywordScore}/30</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Completeness:</span>
                            <span className="font-medium">{clip.score.completenessScore}/30</span>
                        </div>
                    </div>

                    {/* Keywords */}
                    {clip.score.keywords && clip.score.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {clip.score.keywords.slice(0, 5).map((keyword, idx) => (
                                <span
                                    key={idx}
                                    className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs"
                                >
                                    {keyword}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
