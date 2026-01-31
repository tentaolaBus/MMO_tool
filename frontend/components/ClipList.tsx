'use client';

import React from 'react';
import { Clip } from '../lib/types';
import ClipItem from './ClipItem';

interface ClipListProps {
    clips: Clip[];
    selectedClips: Set<string>;
    onToggleClip: (clipId: string) => void;
    onToggleAll: () => void;
    onPreviewClip: (clip: Clip) => void;
    backendUrl: string;
}

export default function ClipList({
    clips,
    selectedClips,
    onToggleClip,
    onToggleAll,
    onPreviewClip,
    backendUrl
}: ClipListProps) {
    const allSelected = clips.length > 0 && clips.every(clip => selectedClips.has(clip.id));
    const someSelected = clips.some(clip => selectedClips.has(clip.id)) && !allSelected;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                        Suggested Clips
                    </h2>
                    <p className="text-gray-600 mt-1">
                        {clips.length} {clips.length === 1 ? 'clip' : 'clips'} generated •{' '}
                        {selectedClips.size} selected
                    </p>
                </div>

                {clips.length > 0 && (
                    <label className="flex items-center cursor-pointer px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(input) => {
                                if (input) {
                                    input.indeterminate = someSelected;
                                }
                            }}
                            onChange={onToggleAll}
                            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="ml-2 font-medium text-gray-700">
                            Select All
                        </span>
                    </label>
                )}
            </div>

            {/* Clips Grid */}
            {clips.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <div className="text-gray-400 mb-2">
                        <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <p className="text-gray-600 font-medium">No clips generated yet</p>
                    <p className="text-gray-500 text-sm mt-1">
                        Clips will appear here once processing is complete
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {clips.map((clip) => (
                        <ClipItem
                            key={clip.id}
                            clip={clip}
                            selected={selectedClips.has(clip.id)}
                            onToggle={onToggleClip}
                            onPreview={onPreviewClip}
                            backendUrl={backendUrl}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
