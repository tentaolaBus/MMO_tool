'use client';

import React from 'react';

interface LanguageSelectorProps {
    currentLang: string;
    onLanguageChange: (lang: string) => void;
    disabled?: boolean;
}

const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'jp', name: 'Japanese' },
    { code: 'kr', name: 'Korean' },
    { code: 'cn', name: 'Chinese' },
];

export default function LanguageSelector({ currentLang, onLanguageChange, disabled }: LanguageSelectorProps) {
    return (
        <div className="flex items-center gap-2">
            <label htmlFor="language-select" className="text-sm font-medium text-gray-700">
                Subtitle Language:
            </label>
            <select
                id="language-select"
                value={currentLang}
                onChange={(e) => onLanguageChange(e.target.value)}
                disabled={disabled}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                        {lang.name}
                    </option>
                ))}
            </select>
        </div>
    );
}
