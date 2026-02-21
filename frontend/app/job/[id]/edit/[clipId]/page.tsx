'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Clip, SubtitleSegment, SubtitleStyle, DEFAULT_SUBTITLE_STYLE } from '../../../../../lib/types';
import { getSubtitles, getClips } from '../../../../../lib/api';
import SubtitleEditor from '../../../../../components/SubtitleEditor';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function EditSubtitlesPage() {
    const params = useParams();
    const router = useRouter();
    const clipId = params.clipId as string;
    const jobId = params.id as string;

    const videoRef = useRef<HTMLVideoElement>(null);
    const [clip, setClip] = useState<Clip | null>(null);
    const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
    const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
    const [subtitleEnabled, setSubtitleEnabled] = useState(true);
    const [language, setLanguage] = useState('en');
    const [currentTime, setCurrentTime] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // ── Load clip data + subtitles (read-only) ────────────────────────────
    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                setError(null);

                console.log('\n🔍 ═══ EDIT PAGE DIAGNOSTIC ═══');
                console.log(`   URL clipId: ${clipId}`);
                console.log(`   URL jobId:  ${jobId}`);
                console.log(`   language:   ${language}`);

                // Step 1: Fetch real clip from DB
                let foundClip: Clip | null = null;
                try {
                    const clipsResponse = await getClips(jobId);
                    console.log(`   Step 1: getClips(${jobId}) → success=${clipsResponse.success}, count=${clipsResponse.clips?.length}`);
                    if (clipsResponse.success && clipsResponse.clips) {
                        // Log ALL clip IDs to see if our clipId is among them
                        console.log(`   Available clip IDs:`, clipsResponse.clips.map((c: any) => c.id));
                        const match = clipsResponse.clips.find((c: any) => c.id === clipId);
                        console.log(`   Match for ${clipId}: ${match ? 'FOUND' : '❌ NOT FOUND'}`);
                        if (match) {
                            foundClip = {
                                id: match.id,
                                jobId: match.jobId,
                                clipIndex: match.clipIndex,
                                videoUrl: match.videoUrl,
                                filename: match.filename,
                                size: 0,
                                createdAt: match.createdAt,
                                duration: match.duration,
                                startTime: match.startTime,
                                endTime: match.endTime,
                                text: match.text,
                            } as Clip;
                        }
                    }
                } catch (e: any) {
                    console.warn('   ❌ Step 1 FAILED:', e.message);
                }

                if (!foundClip) {
                    console.warn(`   ⚠️ FALLBACK: Clip ${clipId} not found in DB for job ${jobId}`);
                    const idx = 0;
                    foundClip = {
                        id: clipId, jobId, clipIndex: idx,
                        videoUrl: `/storage/clips/clip_${jobId}_${idx}.mp4`,
                        filename: `clip_${jobId}_${idx}.mp4`, size: 0,
                        createdAt: new Date().toISOString(),
                    } as Clip;
                } else {
                    console.log(`   ✅ Clip loaded from DB:`, {
                        id: foundClip.id,
                        videoUrl: foundClip.videoUrl,
                        clipIndex: foundClip.clipIndex,
                    });
                }
                setClip(foundClip);

                // Step 2: Load subtitles (read-only — never modified by user)
                try {
                    console.log(`   Step 2: getSubtitles(${clipId}, ${language})...`);
                    const data = await getSubtitles(clipId, language);
                    console.log(`   Step 2 result: success=${data.success}, segments=${data.segments?.length}, cached=${data.cached}`);
                    if (data.success && data.segments?.length) {
                        setSubtitles(data.segments.map((s: any, i: number) => ({
                            id: s.id || `seg_${i}`,
                            start: Number(s.start),
                            end: Number(s.end),
                            text: String(s.text || ''),
                        })));
                        console.log(`   ✅ Loaded ${data.segments.length} subtitle segments`);
                    } else {
                        setSubtitles([]);
                        console.warn(`   ⚠️ No subtitle segments returned`);
                    }
                } catch (e: any) {
                    console.error(`   ❌ Step 2 FAILED: status=${e.response?.status}, message=${e.message}`);
                    if (e.response?.status !== 404) setError(`Subtitle load failed: ${e.message}`);
                    setSubtitles([]);
                }

                // Step 3: Load saved style (if any)
                try {
                    const res = await fetch(`${API_BASE_URL}/clips/${clipId}/subtitle-style`);
                    if (res.ok) {
                        const json = await res.json();
                        if (json.success && json.style) setSubtitleStyle(json.style);
                        if (json.success && typeof json.enabled === 'boolean') setSubtitleEnabled(json.enabled);
                    }
                } catch {
                    // No saved style — use defaults
                }

                setLoading(false);
            } catch (err: any) {
                setError(err.message || 'Failed to load data');
                setLoading(false);
            }
        };

        loadData();
    }, [clipId, jobId, language]);

    // ── Video time tracking ───────────────────────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTime = () => setCurrentTime(video.currentTime);
        video.addEventListener('timeupdate', onTime);
        return () => video.removeEventListener('timeupdate', onTime);
    }, []);

    // ── Active subtitle (memoized — no extra state) ───────────────────────
    const activeSubtitle = useMemo(() =>
        subtitleEnabled
            ? subtitles.find(s => currentTime >= s.start && currentTime <= s.end) ?? null
            : null,
        [currentTime, subtitles, subtitleEnabled]);

    // ── Stable style change callback ──────────────────────────────────────
    const handleStyleChange = useCallback((newStyle: SubtitleStyle) => {
        setSubtitleStyle(newStyle);
    }, []);

    // ── Save style + auto-render + redirect ───────────────────────────────────
    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        console.log('\n💾 ═══ SAVE STYLE DIAGNOSTIC ═══');
        console.log(`   clipId:   ${clipId}`);
        console.log(`   jobId:    ${jobId}`);
        console.log(`   language: ${language}`);
        console.log(`   enabled:  ${subtitleEnabled}`);
        console.log(`   POST URL: ${API_BASE_URL}/clips/${clipId}/subtitle-style`);

        try {
            const res = await fetch(`${API_BASE_URL}/clips/${clipId}/subtitle-style`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ style: subtitleStyle, enabled: subtitleEnabled, language }),
            });
            const json = await res.json();
            console.log(`   Response status: ${res.status}`);
            console.log(`   Response body:`, json);
            if (!json.success) throw new Error(json.message || 'Save failed');

            console.log(`   ✅ Save Style SUCCESS — redirecting to /job/${jobId}/clips`);
            // Success — redirect back to generated clips page
            router.push(`/job/${jobId}/clips`);
        } catch (err: any) {
            console.error(`   ❌ Save Style FAILED:`, err.message);
            setError(err.message || 'Failed to render styled video');
            setSaving(false);
        }
    };

    // ── Compute overlay CSS from style object ─────────────────────────────
    const overlayPositionStyle: React.CSSProperties = subtitleStyle.position === 'middle'
        ? { top: '50%', transform: 'translateY(-50%)' }
        : { bottom: '8%' };

    const hexToRgba = (hex: string, opacity: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${opacity})`;
    };

    const subtitleTextStyle: React.CSSProperties = {
        display: 'inline-block',
        fontSize: `${subtitleStyle.fontSize}px`,
        fontWeight: subtitleStyle.fontWeight,
        lineHeight: subtitleStyle.lineHeight,
        letterSpacing: `${subtitleStyle.letterSpacing}px`,
        color: subtitleStyle.textColor,
        fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
        backgroundColor: hexToRgba(subtitleStyle.backgroundColor, subtitleStyle.backgroundOpacity),
        padding: `${subtitleStyle.padding}px ${subtitleStyle.padding * 1.75}px`,
        borderRadius: `${subtitleStyle.borderRadius}px`,
        maxWidth: '90%',
        wordBreak: 'break-word' as const,
        textShadow: subtitleStyle.textShadow
            ? '0 0 3px rgba(0,0,0,0.9), 0 2px 6px rgba(0,0,0,0.7), 0 0 12px rgba(0,0,0,0.4)'
            : 'none',
        WebkitFontSmoothing: 'antialiased' as any,
        transform: 'translateZ(0)',
    };

    // ── Loading / error states ────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600">Loading subtitle editor…</p>
                </div>
            </div>
        );
    }

    if (!clip) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <p className="text-red-600 mb-4">Clip not found</p>
                    <button onClick={() => router.back()} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Go Back</button>
                </div>
            </div>
        );
    }

    const videoSrc = clip.videoUrl?.startsWith('http') ? clip.videoUrl : `${BACKEND_URL}${clip.videoUrl}`;

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Subtitle Style Editor</h1>
                    <p className="text-sm text-gray-600">
                        Clip #{clip.clipIndex !== undefined ? clip.clipIndex + 1 : '?'} • {subtitles.length} subtitles
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="en">🇬🇧 English</option>
                        <option value="vi">🇻🇳 Vietnamese</option>
                        <option value="jp">🇯🇵 Japanese</option>
                        <option value="kr">🇰🇷 Korean</option>
                        <option value="cn">🇨🇳 Chinese</option>
                    </select>

                    <button
                        onClick={() => router.back()}
                        className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                        Cancel
                    </button>
                </div>
            </div>

            {/* ── Messages ─────────────────────────────────────────── */}
            {error && (
                <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    ⚠️ {error}
                </div>
            )}
            {successMessage && (
                <div className="mx-6 mt-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
                    ✅ {successMessage}
                </div>
            )}

            {/* ── Main content ─────────────────────────────────────── */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Video preview */}
                <div className="w-1/2 p-6 bg-white border-r flex flex-col">
                    <h3 className="text-lg font-semibold mb-4">Video Preview</h3>

                    <div className="flex-1 flex items-center justify-center bg-black rounded-lg overflow-hidden">
                        <div style={{ position: 'relative', aspectRatio: '9 / 16', maxHeight: '80vh', width: 'auto', height: '100%' }}>
                            <video
                                ref={videoRef}
                                src={videoSrc}
                                controls
                                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                            />

                            {/* Live subtitle overlay */}
                            {activeSubtitle && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        right: 0,
                                        textAlign: 'center',
                                        pointerEvents: 'none',
                                        zIndex: 10,
                                        padding: '0 12px',
                                        ...overlayPositionStyle,
                                    }}
                                >
                                    <span style={subtitleTextStyle}>
                                        {activeSubtitle.text}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Save & Render button */}
                    <div className="mt-6">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`
                                w-full px-6 py-3 rounded-lg font-semibold text-white transition shadow-lg
                                ${saving
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700 hover:shadow-xl'
                                }
                            `}
                        >
                            {saving ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Saving & Rendering…
                                </span>
                            ) : (
                                '💾 Save Style'
                            )}
                        </button>
                    </div>
                </div>

                {/* Right: Style controls */}
                <div className="w-1/2 flex flex-col">
                    <SubtitleEditor
                        style={subtitleStyle}
                        onChange={handleStyleChange}
                        subtitleEnabled={subtitleEnabled}
                        onEnabledChange={setSubtitleEnabled}
                        subtitleCount={subtitles.length}
                        language={language}
                    />
                </div>
            </div>
        </div>
    );
}
