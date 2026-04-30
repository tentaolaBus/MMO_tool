'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Scissors, Upload, Link2, FileVideo, X, Sparkles, Loader2,
    Play, Pause, Download, Crop, Type, ChevronDown, ChevronUp, Clock,
    AlertCircle, CheckCircle2, Search, Zap, Film,
} from 'lucide-react';
import Link from 'next/link';
import {
    uploadVideo,
    uploadYoutubeVideo,
    subscribeToProgress,
    pollJobStatus,
    getClips,
    getJobStatus,
    renderClips,
    updateClipSelection,
    downloadSelectedClips,
    downloadClip,
    cleanupJob,
    requestClipReframe,
} from '@/lib/api';
import type { Clip } from '@/lib/types';
import ClipPreviewModal from '@/components/clipper/ClipPreviewModal';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001';

type PageState = 'input' | 'processing' | 'results';
type InputTab = 'upload' | 'youtube';

// ═══════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function AIClippingPage() {
    const router = useRouter();

    // ─── Input ───
    const [activeTab, setActiveTab] = useState<InputTab>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [clipDuration, setClipDuration] = useState(30);

    // ─── State ───
    const [pageState, setPageState] = useState<PageState>('input');
    const [jobId, setJobId] = useState<string | null>(null);
    const [progress, setProgress] = useState({ percent: 0, stage: 'uploading', message: 'Starting...' });
    const [error, setError] = useState<string | null>(null);

    // ─── Results ───
    const [clips, setClips] = useState<Clip[]>([]);
    const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
    const [previewClip, setPreviewClip] = useState<Clip | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [reframeByClip, setReframeByClip] = useState<Record<string, { jobId: string; progress: { percent: number; stage: string; message: string } }>>({});

    const unsubscribeRef = useRef<(() => void) | null>(null);
    const reframeUnsubRef = useRef<Record<string, () => void>>({});
    const mountedRef = useRef(true);
    // jobId / pageState refs let the unmount cleanup observe the LATEST values
    // without making the cleanup re-run on every state change (which would tear
    // down our SSE subscription mid-flight).
    const jobIdRef = useRef<string | null>(null);
    const pageStateRef = useRef<PageState>('input');

    useEffect(() => { jobIdRef.current = jobId; }, [jobId]);
    useEffect(() => { pageStateRef.current = pageState; }, [pageState]);

    // IMPORTANT: re-set mountedRef = true on every mount. Under React Strict
    // Mode (and Next.js dev) the effect runs twice — without this re-set, the
    // first cleanup pass leaves mountedRef.current = false forever and EVERY
    // subsequent setProgress() becomes a silent no-op (the "stuck at 5%" bug).
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            unsubscribeRef.current?.();
            unsubscribeRef.current = null;
            Object.values(reframeUnsubRef.current).forEach((fn) => {
                try { fn(); } catch {}
            });
            reframeUnsubRef.current = {};
            // Best-effort: cancel any pending job we own
            if (jobIdRef.current && pageStateRef.current === 'processing') {
                cleanupJob(jobIdRef.current).catch(() => {});
            }
        };
    }, []);

    const hasInput = activeTab === 'upload' ? !!file : isValidYoutubeUrl(youtubeUrl);

    // ─── Generate ───
    const handleGenerate = useCallback(async () => {
        if (!hasInput || isGenerating) return;
        setIsGenerating(true);

        setPageState('processing');
        setError(null);
        setProgress({
            percent: 0,
            stage: 'uploading',
            message: activeTab === 'upload' ? 'Uploading video...' : 'Starting...',
        });

        try {
            const result = activeTab === 'upload' && file
                ? await uploadVideo(file, (p) => {
                    if (!mountedRef.current) return;
                    // Map raw upload bytes (0–100) into our 0–15% upload band
                    const percent = p < 0 ? 5 : Math.max(5, Math.round(p * 0.15));
                    setProgress({
                        percent,
                        stage: 'uploading',
                        message: p < 0 ? 'Uploading...' : `Uploading ${p}%`,
                    });
                })
                : await uploadYoutubeVideo(youtubeUrl);

            if (!mountedRef.current) return;

            if (!result.success || !result.jobId) {
                setError(result.message || 'Upload failed');
                setPageState('input');
                return;
            }

            const newJobId = result.jobId;
            setJobId(newJobId);

            // 1) Open SSE FIRST — backend has already seeded progressService
            //    with stage='queued' (file upload) or 'downloading' (youtube),
            //    so the first push lands within milliseconds.
            const unsubscribe = subscribeToProgress(
                newJobId,
                (data) => {
                    if (!mountedRef.current) return;
                    console.log('[SSE]', data);
                    setProgress(data);
                    if (data.stage === 'completed') {
                        // Re-check mountedRef just before the (async) follow-up,
                        // in case the user navigated/cancelled while the SSE
                        // 'completed' frame was in flight.
                        if (mountedRef.current) loadClipsForJob(newJobId);
                    }
                    if (data.stage === 'failed') {
                        setError(data.message || 'Processing failed');
                        setPageState('input');
                    }
                },
                () => {
                    if (!mountedRef.current) return;
                    console.warn('[SSE] error → falling back to polling');
                    fallbackPoll(newJobId);
                },
            );
            unsubscribeRef.current = unsubscribe;

            // 2) Belt-and-braces snapshot. If the network or proxy is buffering
            //    the SSE stream, this guarantees the UI moves off "5% Uploading"
            //    immediately. If SSE delivers first, this just gets overwritten
            //    by the next push — harmless.
            try {
                const snap = await getJobStatus(newJobId);
                if (!mountedRef.current || !snap) return;
                const raw: any = (snap as any).progress;
                const percent = typeof raw === 'number' ? raw : (raw?.percent ?? 10);
                const stage = typeof raw === 'object' && raw ? (raw.stage ?? snap.status) : snap.status;
                const message = typeof raw === 'object' && raw ? (raw.message ?? 'Processing...') : 'Processing...';
                setProgress(prev => prev.percent >= percent ? prev : { percent, stage, message });
            } catch {
                // SSE will catch up — no need to surface
            }
        } catch (err: any) {
            if (!mountedRef.current) return;
            setError(err.message || 'Upload failed');
            setPageState('input');
        } finally {
            setIsGenerating(false);
        }
    }, [hasInput, activeTab, file, youtubeUrl, isGenerating]);

    const loadClipsForJob = useCallback(async (jid: string) => {
        try {
            setProgress({ percent: 85, stage: 'generating', message: 'Generating clips...' });
            const existing = await getClips(jid);
            if (existing.success && existing.clips?.length > 0) { showClips(existing.clips); return; }

            const renderResult = await renderClips(jid, 10, (status, pct) => {
                if (!mountedRef.current) return;
                setProgress({ percent: Math.min(95, 85 + pct * 0.1), stage: 'generating', message: `Generating clips... ${pct}%` });
            });
            if (renderResult.success && renderResult.clips) showClips(renderResult.clips);
            else { setError('Failed to generate clips'); setPageState('input'); }
        } catch (err: any) { setError(err.message || 'Failed to load clips'); setPageState('input'); }
    }, []);

    const showClips = useCallback((clipList: Clip[]) => {
        setClips(clipList);
        setSelectedClips(new Set(clipList.filter(c => c.selected).map(c => c.id)));
        setPageState('results');
    }, []);

    const handleReframeClip = useCallback(async (clip: Clip) => {
        try {
            if (reframeByClip[clip.id] && reframeByClip[clip.id]?.progress.stage !== 'failed') return;

            setReframeByClip(prev => ({
                ...prev,
                [clip.id]: { jobId: 'starting', progress: { percent: 0, stage: 'queued', message: 'Queued for AI reframing...' } },
            }));

            const resp = await requestClipReframe({
                clipId: clip.id,
                videoUrl: clip.videoUrl,
                targetAspectRatio: '9:16',
            });

            if (!mountedRef.current) return;
            if (!resp?.success || !resp.jobId) {
                throw new Error('Failed to start reframe job');
            }

            const reframeJobId = resp.jobId;
            setReframeByClip(prev => ({
                ...prev,
                [clip.id]: { jobId: reframeJobId, progress: { percent: 1, stage: 'queued', message: 'Queued for AI reframing...' } },
            }));

            const unsub = subscribeToProgress(
                reframeJobId,
                async (data) => {
                    if (!mountedRef.current) return;
                    setReframeByClip(prev => ({
                        ...prev,
                        [clip.id]: { jobId: reframeJobId, progress: data },
                    }));

                    if (data.stage === 'completed') {
                        try {
                            const refreshed = await getClips(clip.jobId);
                            if (mountedRef.current && refreshed?.success && refreshed.clips) {
                                setClips(refreshed.clips);
                            }
                        } finally {
                            reframeUnsubRef.current[clip.id]?.();
                            delete reframeUnsubRef.current[clip.id];
                            setReframeByClip(prev => {
                                const next = { ...prev };
                                delete next[clip.id];
                                return next;
                            });
                        }
                    }
                },
                () => {
                    if (!mountedRef.current) return;
                    setReframeByClip(prev => ({
                        ...prev,
                        [clip.id]: { jobId: reframeJobId, progress: { percent: 0, stage: 'failed', message: 'Progress connection lost. Retry reframe.' } },
                    }));
                },
            );

            reframeUnsubRef.current[clip.id] = unsub;
        } catch (err: any) {
            if (!mountedRef.current) return;
            setReframeByClip(prev => ({
                ...prev,
                [clip.id]: { jobId: 'error', progress: { percent: 0, stage: 'failed', message: err.message || 'Failed to start reframing' } },
            }));
        }
    }, [reframeByClip]);

    const fallbackPoll = useCallback(async (jid: string) => {
        try {
            const completedJob = await pollJobStatus(jid, (job) => {
                if (!mountedRef.current) return;
                setProgress({ percent: job.progress || 0, stage: 'processing', message: `Processing... ${job.progress || 0}%` });
            });
            if (completedJob.status === 'failed') { setError(completedJob.error || 'Processing failed'); setPageState('input'); return; }
            loadClipsForJob(jid);
        } catch (err: any) { setError(err.message); setPageState('input'); }
    }, [loadClipsForJob]);

    // ─── Clip actions ───
    const toggleClip = useCallback(async (clipId: string) => {
        setSelectedClips(prev => {
            const next = new Set(prev);
            prev.has(clipId) ? next.delete(clipId) : next.add(clipId);
            return next;
        });
        try { await updateClipSelection(clipId, !selectedClips.has(clipId)); } catch {}
    }, [selectedClips]);

    const toggleAll = useCallback(async () => {
        const allSel = selectedClips.size === clips.length;
        const newSel = allSel ? new Set<string>() : new Set(clips.map(c => c.id));
        setSelectedClips(newSel);
        for (const c of clips) { try { await updateClipSelection(c.id, !allSel); } catch {} }
    }, [clips, selectedClips]);

    const handleDownload = useCallback(async () => {
        const ids = Array.from(selectedClips);
        if (ids.length === 0) return;
        setDownloading(true);
        setError(null);
        try {
            await downloadSelectedClips(ids);
            if (jobId) { try { await cleanupJob(jobId); } catch {} }
            router.push('/');
        } catch (err: any) { setError(err.message || 'Download failed'); }
        finally { setDownloading(false); }
    }, [selectedClips, jobId, router]);

    const handleReset = useCallback(() => {
        if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
        setFile(null);
        setYoutubeUrl('');
        setJobId(null);
        setClips([]);
        setSelectedClips(new Set());
        setPageState('input');
        setError(null);
        setIsGenerating(false);
    }, []);

    // ─── Cancel & cleanup on "Back to Tools" ───
    const handleBackToTools = useCallback(async () => {
        if (pageState === 'processing' && jobId) {
            setIsCancelling(true);
            // Stop SSE
            if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
            try {
                await cleanupJob(jobId);
            } catch {}
            setIsCancelling(false);
        }
        router.push('/');
    }, [pageState, jobId, router]);

    return (
        <main className="min-h-screen bg-gradient-to-br from-background via-background to-purple-950/10 py-6 px-4">
            <div className="container mx-auto max-w-6xl">
                {/* Header */}
                <div className="mb-8">
                    {isCancelling ? (
                        <div className="inline-flex items-center gap-1.5 text-sm text-amber-500 mb-4">
                            <Loader2 className="size-4 animate-spin" /> Cancelling process...
                        </div>
                    ) : (
                        <button onClick={handleBackToTools}
                            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-purple-500 transition-colors mb-4">
                            <ArrowLeft className="size-4" /> Back to Tools
                        </button>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="size-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                            <Scissors className="size-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">AI Video Clipper</h1>
                            <p className="text-muted-foreground text-sm">Turn long videos into viral short-form clips</p>
                        </div>
                    </div>
                </div>

                {/* ═══ INPUT STATE ═══ */}
                {pageState === 'input' && (
                    <div className="max-w-3xl mx-auto space-y-5">
                        {/* Tab bar */}
                        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                            <div className="flex border-b border-border">
                                <TabButton
                                    active={activeTab === 'upload'}
                                    onClick={() => setActiveTab('upload')}
                                    icon={<Upload className="size-4" />}
                                    label="Upload File"
                                />
                                <TabButton
                                    active={activeTab === 'youtube'}
                                    onClick={() => setActiveTab('youtube')}
                                    icon={<Link2 className="size-4" />}
                                    label="YouTube Link"
                                />
                            </div>

                            <div className="p-6">
                                {activeTab === 'upload' ? (
                                    <UploadDropzone file={file} onFileSelect={setFile} />
                                ) : (
                                    <YouTubeInput url={youtubeUrl} onChange={setYoutubeUrl} />
                                )}
                            </div>
                        </div>

                        {/* Settings + CTA */}
                        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-foreground mb-3">Clip Duration</label>
                                <div className="flex gap-2">
                                    {[
                                        { value: 15, label: '15s', desc: 'TikTok' },
                                        { value: 30, label: '30s', desc: 'Reels' },
                                        { value: 60, label: '60s', desc: 'Shorts' },
                                    ].map(d => (
                                        <button
                                            key={d.value}
                                            onClick={() => setClipDuration(d.value)}
                                            className={`
                                                flex-1 flex flex-col items-center gap-0.5 py-3 px-3 rounded-xl border-2 transition-all duration-200
                                                ${clipDuration === d.value
                                                    ? 'border-purple-500 bg-purple-500/10'
                                                    : 'border-border hover:border-purple-400/40 hover:bg-muted/30'}
                                            `}
                                        >
                                            <span className={`text-sm font-bold ${clipDuration === d.value ? 'text-purple-500' : 'text-foreground'}`}>{d.label}</span>
                                            <span className="text-[10px] text-muted-foreground">{d.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* CTA Button */}
                            <button
                                onClick={handleGenerate}
                                disabled={!hasInput}
                                className={`
                                    w-full flex items-center justify-center gap-2.5 py-4 px-4 rounded-xl
                                    font-semibold text-base transition-all duration-300 shadow-lg active:scale-[0.98]
                                    ${!hasInput
                                        ? 'bg-muted text-muted-foreground cursor-not-allowed shadow-none'
                                        : 'bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 hover:from-purple-500 hover:via-purple-400 hover:to-pink-400 text-white hover:shadow-xl hover:shadow-purple-500/25'}
                                `}
                            >
                                <Sparkles className="size-5" />
                                Generate Viral Clips
                            </button>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl animate-in slide-in-from-top-2 duration-300">
                                <AlertCircle className="size-5 text-red-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm text-red-400 font-medium">Something went wrong</p>
                                    <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
                                </div>
                            </div>
                        )}

                        {/* How it works */}
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { icon: <Upload className="size-4" />, label: 'Upload', desc: 'Video or link' },
                                { icon: <Search className="size-4" />, label: 'Analyze', desc: 'AI finds highlights' },
                                { icon: <Zap className="size-4" />, label: 'Generate', desc: 'Best clips extracted' },
                                { icon: <Download className="size-4" />, label: 'Download', desc: 'Ready to post' },
                            ].map((step, i) => (
                                <div key={i} className="text-center p-3 rounded-xl bg-card border border-border/50">
                                    <div className="size-8 mx-auto rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 mb-2">{step.icon}</div>
                                    <p className="text-xs font-semibold text-foreground">{step.label}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{step.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══ PROCESSING STATE ═══ */}
                {pageState === 'processing' && (
                    <div className="max-w-lg mx-auto">
                        <ProcessingView progress={progress} />
                    </div>
                )}

                {/* ═══ RESULTS STATE ═══ */}
                {pageState === 'results' && (
                    <div className="space-y-5">
                        <div className="flex items-center justify-between">
                            <button onClick={handleReset} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-purple-500 transition-colors">
                                <ArrowLeft className="size-4" /> New Video
                            </button>
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                                    <input type="checkbox" checked={selectedClips.size === clips.length && clips.length > 0} onChange={toggleAll}
                                        className="size-4 rounded border-border accent-purple-500" />
                                    Select All
                                </label>
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <AlertCircle className="size-4 text-red-400 mt-0.5" />
                                <span className="text-sm text-red-400">{error}</span>
                            </div>
                        )}

                        {/* Results header */}
                        <div className="flex items-center gap-3">
                            <div className="size-9 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                                <Film className="size-4 text-green-500" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-foreground">{clips.length} Clips Generated</h2>
                                <p className="text-xs text-muted-foreground">Ranked by AI virality score — select and download</p>
                            </div>
                        </div>

                        {/* Clips grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {clips.map((clip) => (
                                <ClipCard
                                    key={clip.id}
                                    clip={clip}
                                    selected={selectedClips.has(clip.id)}
                                    onToggle={toggleClip}
                                    onPreview={setPreviewClip}
                                    backendUrl={BACKEND_URL}
                                    onReframe={handleReframeClip}
                                    reframeState={reframeByClip[clip.id]?.progress || null}
                                />
                            ))}
                        </div>

                        {/* Preview modal — shared across all cards */}
                        <ClipPreviewModal
                            clip={previewClip}
                            clips={clips}
                            onClose={() => setPreviewClip(null)}
                            onChange={setPreviewClip}
                            onDownload={(c) => downloadClip(c.id)}
                            backendUrl={BACKEND_URL}
                        />

                        {/* Download bar */}
                        {selectedClips.size > 0 && (
                            <div className="sticky bottom-4 bg-card/95 backdrop-blur-md border border-border rounded-2xl p-4 shadow-xl flex items-center justify-between">
                                <span className="text-sm text-foreground font-medium">
                                    {selectedClips.size} clip{selectedClips.size !== 1 ? 's' : ''} selected
                                </span>
                                <button
                                    onClick={handleDownload}
                                    disabled={downloading}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                                >
                                    {downloading ? (
                                        <><div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Downloading...</>
                                    ) : (
                                        <><Download className="size-4" /> Download {selectedClips.size > 1 ? 'ZIP' : 'Clip'}</>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}

// ═══════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button
            onClick={onClick}
            className={`
                flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-all duration-200
                ${active
                    ? 'text-purple-500 border-b-2 border-purple-500 bg-purple-500/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30 border-b-2 border-transparent'}
            `}
        >
            {icon}
            {label}
        </button>
    );
}

// ─── Upload Dropzone ───

function UploadDropzone({ file, onFileSelect }: { file: File | null; onFileSelect: (f: File | null) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);

    const handleFile = (f: File) => {
        if (f.size > 500 * 1024 * 1024) { setFileError('File too large. Maximum size is 500MB.'); return; }
        const validTypes = ['video/mp4', 'video/quicktime', 'video/mpeg', 'video/x-msvideo', 'video/webm'];
        if (!validTypes.includes(f.type) && !f.name.match(/\.(mp4|mov|avi|mpeg|webm)$/i)) {
            setFileError('Invalid file type. Please use MP4, MOV or AVI.');
            return;
        }
        setFileError(null);
        onFileSelect(f);
    };

    return (
        <div>
            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => inputRef.current?.click()}
                className={`
                    relative flex flex-col items-center justify-center
                    w-full min-h-[220px] rounded-2xl border-2 border-dashed
                    transition-all duration-300 cursor-pointer
                    ${isDragging
                        ? 'border-purple-400 bg-purple-500/10 scale-[1.01]'
                        : file
                            ? 'border-green-400/50 bg-green-500/5 hover:bg-green-500/10'
                            : 'border-border hover:border-purple-400/50 hover:bg-purple-500/5'}
                `}
            >
                {isDragging && (
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/15 via-pink-500/15 to-purple-500/15 animate-pulse" />
                )}

                <input ref={inputRef} type="file" accept="video/*"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    className="hidden" id="clipper-video-input" />

                {file ? (
                    <div className="relative z-10 flex flex-col items-center gap-3 p-6">
                        <div className="size-14 rounded-2xl bg-green-500/10 flex items-center justify-center">
                            <FileVideo className="size-7 text-green-500" />
                        </div>
                        <div className="text-center">
                            <p className="font-semibold text-foreground truncate max-w-[300px]">{file.name}</p>
                            <p className="text-muted-foreground text-sm mt-1">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onFileSelect(null); }}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-border hover:border-red-400/40">
                            <X className="size-3" /> Remove
                        </button>
                    </div>
                ) : (
                    <div className="relative z-10 flex flex-col items-center gap-3 p-6">
                        <div className="size-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-1">
                            <Upload className="size-7 text-purple-500" />
                        </div>
                        <div className="text-center">
                            <p className="text-foreground font-semibold">
                                Drop your video here or <span className="text-purple-500">click to upload</span>
                            </p>
                            <p className="text-muted-foreground text-sm mt-1.5">Supports MP4, MOV up to 500MB</p>
                        </div>
                    </div>
                )}
            </div>
            {fileError && (
                <div className="flex items-center gap-2 mt-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle className="size-4 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-400">{fileError}</p>
                </div>
            )}
        </div>
    );
}

// ─── YouTube Input ───

function isValidYoutubeUrl(url: string): boolean {
    return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/).+/.test(url.trim());
}

function YouTubeInput({ url, onChange }: { url: string; onChange: (u: string) => void }) {
    const isValid = url.trim().length > 0 && isValidYoutubeUrl(url);
    const hasInput = url.trim().length > 0;

    return (
        <div className="space-y-4">
            <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Link2 className="size-5" />
                </div>
                <input
                    type="url"
                    value={url}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Paste YouTube link here..."
                    className={`
                        w-full pl-12 pr-12 py-4 rounded-xl border-2 bg-background text-foreground text-base
                        placeholder:text-muted-foreground/60 focus:outline-none transition-all
                        ${hasInput && !isValid
                            ? 'border-red-400/50 focus:border-red-400'
                            : isValid
                                ? 'border-green-400/50 focus:border-green-400'
                                : 'border-border focus:border-purple-500'}
                    `}
                    id="youtube-url-input"
                />
                {url && (
                    <button onClick={() => onChange('')}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        <X className="size-4" />
                    </button>
                )}
            </div>

            {hasInput && !isValid && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                    <AlertCircle className="size-3.5" /> Please enter a valid YouTube URL
                </p>
            )}

            {isValid && (
                <div className="flex items-center gap-2 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                    <CheckCircle2 className="size-4 text-green-500 flex-shrink-0" />
                    <span className="text-sm text-green-500">Valid YouTube URL — ready to process</span>
                </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/30">
                <Clock className="size-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                    Supports videos up to 30 minutes. Longer videos may take more time to process.
                </p>
            </div>
        </div>
    );
}

// ─── Processing View (Step-based) ───

// Each step accepts MULTIPLE backend stage names so this stays in sync with
// processor.ts / queue.ts / upload.ts emissions. Adding a new backend stage?
// Add its key here too.
const PROCESSING_STEPS: { keys: string[]; label: string; icon: any }[] = [
    { keys: ['uploading', 'downloading'],                                    label: 'Uploading',            icon: Upload },
    { keys: ['queued', 'initializing', 'analyzing', 'processing'],           label: 'Analyzing video',      icon: Search },
    { keys: ['extracting_audio', 'transcribing', 'saving'],                  label: 'Finding best moments', icon: Zap    },
    { keys: ['generating'],                                                  label: 'Generating clips',     icon: Film   },
];

function findStepIndex(stage: string): number {
    return PROCESSING_STEPS.findIndex(s => s.keys.includes(stage));
}

function ProcessingView({ progress }: { progress: { percent: number; stage: string; message: string } }) {
    const currentIdx = findStepIndex(progress.stage);
    const activeIdx = currentIdx >= 0
        ? currentIdx
        : (progress.stage === 'completed' ? PROCESSING_STEPS.length : 0);

    return (
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="p-8 flex flex-col items-center">
                {/* Circular progress */}
                <div className="relative mb-8">
                    <div className="size-28 rounded-full border-4 border-muted flex items-center justify-center">
                        <span className="text-3xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                            {progress.percent}%
                        </span>
                    </div>
                    <svg className="absolute inset-0 size-28 -rotate-90" viewBox="0 0 112 112">
                        <circle
                            cx="56" cy="56" r="52"
                            fill="none" stroke="url(#progGrad)" strokeWidth="4"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 52}`}
                            strokeDashoffset={`${2 * Math.PI * 52 * (1 - progress.percent / 100)}`}
                            className="transition-all duration-700 ease-out"
                        />
                        <defs>
                            <linearGradient id="progGrad" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#a855f7" />
                                <stop offset="100%" stopColor="#ec4899" />
                            </linearGradient>
                        </defs>
                    </svg>
                </div>

                {/* Current message */}
                <div className="flex items-center gap-2 text-sm text-purple-500 mb-6 font-medium">
                    <Loader2 className="size-4 animate-spin" />
                    {progress.message}
                </div>

                {/* Steps */}
                <div className="w-full max-w-sm space-y-2.5">
                    {PROCESSING_STEPS.map((step, i) => {
                        const Icon = step.icon;
                        const done = i < activeIdx;
                        const active = i === activeIdx;
                        return (
                            <div key={step.keys[0]} className={`
                                flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300
                                ${done ? 'bg-green-500/5' : active ? 'bg-purple-500/10' : 'bg-muted/20'}
                            `}>
                                <div className={`size-7 rounded-lg flex items-center justify-center flex-shrink-0
                                    ${done ? 'bg-green-500/20 text-green-500'
                                        : active ? 'bg-purple-500/20 text-purple-500'
                                            : 'bg-muted text-muted-foreground'}`}>
                                    {done ? <CheckCircle2 className="size-4" /> : active ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                                </div>
                                <span className={`text-sm font-medium
                                    ${done ? 'text-green-500' : active ? 'text-purple-500' : 'text-muted-foreground'}`}>
                                    {step.label}
                                    {done && <span className="ml-1 text-xs opacity-60">✓</span>}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Notice */}
                <p className="text-xs text-muted-foreground mt-6 text-center max-w-xs">
                    Processing time depends on video length. Please keep this tab open.
                </p>
            </div>
        </div>
    );
}

// ─── Clip Card ───

function ClipCard({ clip, selected, onToggle, onPreview, backendUrl, onReframe, reframeState }: {
    clip: Clip;
    selected: boolean;
    onToggle: (id: string) => void;
    onPreview: (clip: Clip) => void;
    backendUrl: string;
    onReframe: (clip: Clip) => void;
    reframeState: { percent: number; stage: string; message: string } | null;
}) {
    const [hovering, setHovering] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const cacheBuster = clip.updatedAt ? `?v=${new Date(clip.updatedAt).getTime()}` : '';
    const videoSrc = (clip.videoUrl?.startsWith('http') ? clip.videoUrl : `${backendUrl}${clip.videoUrl}`) + cacheBuster;

    const rawScore = clip.score?.total || 0;
    const displayScore = (rawScore / 10).toFixed(1); // Convert 0-100 to 0-10
    const duration = clip.duration ? `${Math.round(clip.duration)}s` : '';

    const scoreColor = rawScore >= 80
        ? 'text-green-400 bg-green-500/15 border-green-500/30'
        : rawScore >= 60
            ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
            : 'text-muted-foreground bg-muted/50 border-border';

    // Generate a hook/title from the text
    const hookText = clip.text
        ? clip.text.length > 80
            ? clip.text.substring(0, 80).trim() + '...'
            : clip.text
        : `Clip #${clip.clipIndex + 1}`;

    // Open preview on card click — but ignore clicks that bubble up from
    // interactive controls (Reframe/Subtitles links, checkbox, score toggle).
    // Those controls all call e.stopPropagation() in their own handlers below.
    const openPreview = () => onPreview(clip);
    const stop = (e: React.MouseEvent | React.ChangeEvent) => e.stopPropagation();

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`Preview clip ${clip.clipIndex + 1}`}
            onClick={openPreview}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openPreview();
                }
            }}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            className={`
                bg-card rounded-2xl border-2 overflow-hidden transition-all duration-200 group cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-background
                ${selected ? 'border-purple-500 shadow-lg shadow-purple-500/10' : 'border-border hover:border-purple-400/30'}
            `}
        >
            {/* Video thumbnail */}
            <div className="relative bg-black aspect-video">
                <video
                    key={videoSrc}
                    src={videoSrc}
                    className="w-full h-full object-contain"
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    ref={(v) => {
                        if (v) { hovering ? v.play().catch(() => {}) : (v.pause(), v.currentTime = 0); }
                    }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/15 transition-all pointer-events-none">
                    <div className="size-11 rounded-full bg-white/90 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                        <Play className="size-5 text-purple-600 ml-0.5" fill="currentColor" />
                    </div>
                </div>

                {/* AI Score badge */}
                <div className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${scoreColor} backdrop-blur-sm pointer-events-none`}>
                    ⚡ {displayScore}/10
                </div>

                {/* Duration */}
                {duration && (
                    <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 text-[11px] text-white font-medium backdrop-blur-sm pointer-events-none">
                        {duration}
                    </div>
                )}
            </div>

            {/* Card body */}
            <div className="p-4 space-y-3">
                {/* Selection + hook */}
                <div className="flex items-start gap-2.5">
                    <input
                        type="checkbox"
                        checked={selected}
                        onClick={stop}
                        onChange={(e) => { e.stopPropagation(); onToggle(clip.id); }}
                        className="size-4 rounded border-border accent-purple-500 mt-0.5 flex-shrink-0 cursor-pointer"
                        aria-label={`Select clip ${clip.clipIndex + 1}`}
                    />
                    <p className="text-sm text-foreground font-medium leading-snug line-clamp-2">
                        {hookText}
                    </p>
                </div>

                {/* Actions — stopPropagation so card click doesn't fire */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onReframe(clip); }}
                        disabled={!!reframeState && reframeState.stage !== 'failed'}
                        className={`
                            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors
                            ${reframeState
                                ? (reframeState.stage === 'failed'
                                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/15'
                                    : 'bg-blue-500/15 text-blue-400 cursor-not-allowed')
                                : 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'}
                        `}
                    >
                        <Crop className="size-3" />
                        {reframeState
                            ? (reframeState.stage === 'failed'
                                ? 'Retry Reframe'
                                : `Reframing ${Math.round(reframeState.percent)}%`)
                            : 'Reframe'}
                    </button>
                    <Link
                        href="/subtitles"
                        onClick={stop}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 text-[11px] font-medium hover:bg-amber-500/20 transition-colors"
                    >
                        <Type className="size-3" /> Subtitles
                    </Link>
                </div>

                {reframeState && (
                    <div onClick={stop} className={`text-[11px] ${reframeState.stage === 'failed' ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {reframeState.message || 'Reframing...'}
                    </div>
                )}

                {/* Score breakdown */}
                {clip.score && (
                    <div onClick={stop}>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            AI Score Breakdown
                        </button>
                        {expanded && (
                            <div className="mt-2 space-y-1.5 text-[11px] bg-muted/30 p-3 rounded-xl">
                                <ScoreBar label="Duration fit" value={clip.score.durationScore} max={40} />
                                <ScoreBar label="Keywords" value={clip.score.keywordScore} max={30} />
                                <ScoreBar label="Completeness" value={clip.score.completenessScore} max={30} />
                                {clip.score.keywords?.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {clip.score.keywords.slice(0, 5).map((kw, i) => (
                                            <span key={i} className="px-1.5 py-0.5 bg-purple-500/10 text-purple-500 rounded text-[10px] font-medium">{kw}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
    const pct = Math.round((value / max) * 100);
    return (
        <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 text-[11px]">{label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                    style={{ width: `${pct}%` }} />
            </div>
            <span className="text-muted-foreground text-[11px] font-medium w-10 text-right">{value}/{max}</span>
        </div>
    );
}
