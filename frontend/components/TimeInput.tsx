'use client';

import React, { useState } from 'react';

interface TimeInputProps {
    value: number; // seconds
    onChange: (value: number) => void;
    disabled?: boolean;
}

export default function TimeInput({ value, onChange, disabled = false }: TimeInputProps) {
    const [inputValue, setInputValue] = useState(formatTime(value));
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInputValue(newValue);

        // Parse time string to seconds
        const seconds = parseTime(newValue);

        if (seconds === null) {
            setError('Invalid time format (use MM:SS.mmm)');
        } else {
            setError(null);
            onChange(seconds);
        }
    };

    const handleBlur = () => {
        // Re-format on blur
        if (error === null) {
            setInputValue(formatTime(value));
        }
    };

    return (
        <div className="flex flex-col">
            <input
                type="text"
                value={inputValue}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={disabled}
                placeholder="00:00.000"
                className={`
                    px-3 py-1 text-sm font-mono border rounded
                    ${error ? 'border-red-500 bg-red-50' : 'border-gray-300'}
                    ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
                    focus:outline-none focus:ring-2 focus:ring-blue-500
                `}
                style={{ width: '100px' }}
            />
            {error && (
                <span className="text-xs text-red-600 mt-1">{error}</span>
            )}
        </div>
    );
}

/**
 * Format seconds to MM:SS.mmm format
 */
function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);

    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Parse MM:SS.mmm format to seconds
 */
function parseTime(timeStr: string): number | null {
    // Match MM:SS.mmm or MM:SS
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);

    if (!match) {
        return null;
    }

    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0;

    if (seconds >= 60 || milliseconds >= 1000) {
        return null;
    }

    return minutes * 60 + seconds + milliseconds / 1000;
}
