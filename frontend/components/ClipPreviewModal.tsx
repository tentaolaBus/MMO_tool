'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Clip, SubtitleSegment, SubtitleStyle } from '../lib/types';
import { getSubtitles } from '../lib/api';
import SubtitleOverlay from './SubtitleOverlay';
import LanguageSelector from './LanguageSelector';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface ClipPreviewModalProps {
    clip: Clip | null;
    isOpen: boolean;
    onClose: () => void;
    backendUrl: string;
}

export default function ClipPreviewModal({ clip, isOpen, onClose, backendUrl }: ClipPreviewModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [currentLanguage, setCurrentLanguage] = useState('en');
    const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedStyle, setSavedStyle] = useState<SubtitleStyle | null>(null);
    const [savedEnabled, setSavedEnabled] = useState<boolean>(true);

    // Load saved subtitle style when clip changes
    useEffect(() => {
        if (!clip) return;
        const clipId = clip.id || `${clip.jobId}_${clip.clipIndex}`;
        const styleUrl = `${API_BASE_URL}/clips/${clipId}/subtitle-style`;
        fetch(styleUrl)
            .then(r => r.json())
            .then(json => {
                if (json.success && json.style) {
                    setSavedStyle(json.style);
                } else {
                    setSavedStyle(null);
                }
                setSavedEnabled(json.success && typeof json.enabled === 'boolean' ? json.enabled : true);
            })
            .catch(() => { setSavedStyle(null); setSavedEnabled(true); });
    }, [clip]);

    // Load subtitles when clip or language changes
    useEffect(() => {
        if (!clip) return;

        const loadSubtitles = async () => {
            setLoading(true);
            setError(null);

            try {
                // Use the clip's database ID (UUID)
                // Fallback to jobId_clipIndex format if id is not available
                const clipId = clip.id || `${clip.jobId}_${clip.clipIndex}`;

                console.log('📋 Loading subtitles for clipId:', clipId, 'language:', currentLanguage);

                const response = await getSubtitles(clipId, currentLanguage);

                if (response.success && response.segments) {
                    setSubtitles(response.segments);
                    console.log('✅ Loaded', response.segments.length, 'subtitle segments');
                } else {
                    // No subtitles available but not an error
                    setSubtitles([]);
                }
            } catch (err: any) {
                console.error('Error loading subtitles:', err);

                // Handle 404 gracefully - just means no subtitles yet
                if (err.response?.status === 404) {
                    setSubtitles([]);
                    // Don't show error for 404 - subtitle might not exist yet
                    console.log('ℹ️ No subtitles available for this clip');
                } else {
                    setError(err.message || 'Failed to load subtitles');
                }
            } finally {
                setLoading(false);
            }
        };

        loadSubtitles();
    }, [clip, currentLanguage]);


    // Update current time on video progress
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime);
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        return () => video.removeEventListener('timeupdate', handleTimeUpdate);
    }, []);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setCurrentTime(0);
            setSubtitles([]);
            setError(null);
            setSavedStyle(null);
            setSavedEnabled(true);
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
            }
        }
    }, [isOpen]);

    if (!isOpen || !clip) {
        return null;
    }

    const cacheBuster = clip.updatedAt ? `?v=${new Date(clip.updatedAt).getTime()}` : '';
    const videoSrc = (clip.videoUrl?.startsWith('http') ? clip.videoUrl : `${backendUrl}${clip.videoUrl}`) + cacheBuster;
    console.log(`🎬 Preview modal — videoSrc: ${videoSrc} (updatedAt: ${clip.updatedAt})`);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-4"
            onClick={onClose}
        >
            <div
                className="bg-gray-900 rounded-lg shadow-2xl overflow-hidden flex flex-col"
                style={{
                    height: '90vh',
                    maxHeight: '90vh',
                    width: 'auto',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
                    <div>
                        <h2 className="text-lg font-bold text-white">
                            Clip Preview #{clip.clipIndex !== undefined ? clip.clipIndex + 1 : '?'}
                        </h2>
                        {clip.duration && (
                            <p className="text-xs text-gray-400">Duration: {Math.round(clip.duration)}s</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition p-1"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Subtitle Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
                    <LanguageSelector
                        currentLang={currentLanguage}
                        onLanguageChange={setCurrentLanguage}
                        disabled={loading}
                    />

                    {loading && (
                        <span className="text-xs text-gray-400">Loading subtitles...</span>
                    )}
                </div>

                {/* Video Player Container - 9:16 aspect ratio */}
                <div
                    className="relative flex-1 bg-black flex items-center justify-center overflow-hidden"
                >
                    <div
                        className="relative h-full"
                        style={{
                            aspectRatio: '9 / 16',
                            maxWidth: '100%',
                        }}
                    >
                        <video
                            key={videoSrc}
                            ref={videoRef}
                            src={videoSrc}
                            controls
                            autoPlay
                            className="w-full h-full object-contain"
                            style={{
                                backgroundColor: 'black',
                            }}
                        />

                        {/* Subtitle Overlay — respects saved enabled/disabled setting */}
                        <SubtitleOverlay
                            segments={subtitles}
                            currentTime={currentTime}
                            enabled={savedEnabled}
                            style={savedStyle}
                        />
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="px-4 py-2 bg-red-900 border-t border-red-700">
                        <p className="text-xs text-red-300">⚠ {error}</p>
                    </div>
                )}

                {/* Clip Info - Compact */}
                {clip.text && (
                    <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 max-h-20 overflow-y-auto">
                        <p className="text-xs text-gray-300 line-clamp-2">
                            <strong className="text-gray-200">Content:</strong> {clip.text}
                        </p>
                        {clip.score && (
                            <p className="text-xs text-gray-400 mt-1">
                                Score: {clip.score.total}/100
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
