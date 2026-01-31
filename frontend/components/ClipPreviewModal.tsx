'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Clip, SubtitleSegment } from '../lib/types';
import { getSubtitles } from '../lib/api';
import SubtitleOverlay from './SubtitleOverlay';
import LanguageSelector from './LanguageSelector';
import SubtitleToggle from './SubtitleToggle';

interface ClipPreviewModalProps {
    clip: Clip | null;
    isOpen: boolean;
    onClose: () => void;
    backendUrl: string;
}

export default function ClipPreviewModal({ clip, isOpen, onClose, backendUrl }: ClipPreviewModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
    const [currentLanguage, setCurrentLanguage] = useState('en');
    const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load subtitles when clip or language changes
    useEffect(() => {
        if (!clip) return;

        const loadSubtitles = async () => {
            setLoading(true);
            setError(null);

            try {
                // Construct clipId from jobId and clipIndex
                // Format: jobId_clipIndex (e.g., "abc-123_0")
                const clipId = `${clip.jobId}_${clip.clipIndex}`;

                console.log('Loading subtitles for clipId:', clipId, 'language:', currentLanguage);

                const response = await getSubtitles(clipId, currentLanguage);

                if (response.success && response.segments) {
                    setSubtitles(response.segments);
                } else {
                    setError('Failed to load subtitles');
                }
            } catch (err: any) {
                console.error('Error loading subtitles:', err);
                setError(err.message || 'Failed to load subtitles');
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
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
            }
        }
    }, [isOpen]);

    if (!isOpen || !clip) {
        return null;
    }

    const videoSrc = `${backendUrl}${clip.videoUrl}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">
                            Clip Preview #{clip.clipIndex !== undefined ? clip.clipIndex + 1 : '?'}
                        </h2>
                        {clip.duration && (
                            <p className="text-sm text-gray-600">Duration: {Math.round(clip.duration)}s</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Subtitle Controls */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gray-50 border-b">
                    <SubtitleToggle
                        enabled={subtitlesEnabled}
                        onToggle={() => setSubtitlesEnabled(!subtitlesEnabled)}
                    />

                    <LanguageSelector
                        currentLang={currentLanguage}
                        onLanguageChange={setCurrentLanguage}
                        disabled={loading}
                    />

                    {loading && (
                        <span className="text-sm text-gray-600">Loading subtitles...</span>
                    )}
                </div>

                {/* Video Player */}
                <div className="relative bg-black flex-1 flex items-center justify-center">
                    <video
                        ref={videoRef}
                        src={videoSrc}
                        controls
                        className="max-w-full max-h-full"
                        autoPlay
                    />

                    {/* Subtitle Overlay */}
                    <SubtitleOverlay
                        segments={subtitles}
                        currentTime={currentTime}
                        enabled={subtitlesEnabled}
                    />
                </div>

                {/* Error Message */}
                {error && (
                    <div className="p-4 bg-red-50 border-t border-red-200">
                        <p className="text-sm text-red-600">⚠ {error}</p>
                    </div>
                )}

                {/* Clip Info */}
                {clip.text && (
                    <div className="p-4 border-t">
                        <p className="text-sm text-gray-700">
                            <strong>Content:</strong> {clip.text}
                        </p>
                        {clip.score && (
                            <p className="text-sm text-gray-600 mt-2">
                                Score: {clip.score.total}/100
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
