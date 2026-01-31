'use client';

import React from 'react';

interface SubtitleToggleProps {
    enabled: boolean;
    onToggle: () => void;
}

export default function SubtitleToggle({ enabled, onToggle }: SubtitleToggleProps) {
    return (
        <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm font-medium text-gray-700">Subtitles:</span>
            <div className="relative">
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={onToggle}
                    className="sr-only peer"
                />
                <div
                    className={`w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                />
                <div
                    className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${enabled ? 'translate-x-5' : ''
                        }`}
                />
            </div>
            <span className="text-sm text-gray-600">{enabled ? 'ON' : 'OFF'}</span>
        </label>
    );
}
