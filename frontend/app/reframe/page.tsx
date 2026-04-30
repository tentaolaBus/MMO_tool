'use client';

import { useReframeProcessing } from '@/features/video-reframing';
import ReframeUpload from '@/components/reframe/ReframeUpload';
import CropAdjuster from '@/components/reframe/CropAdjuster';
import ReframeControls from '@/components/reframe/ReframeControls';
import VideoPreviewWithOverlay from '@/components/VideoPreviewWithOverlay';
import ReframeProgress from '@/components/ReframeProgress';
import { ArrowLeft, Smartphone, Monitor } from 'lucide-react';
import Link from 'next/link';

export default function ReframePage() {
    const {
        file,
        previewUrl,
        meta,
        settings,
        progress,
        status,
        error,
        downloadReady,
        selectFile,
        setRatio,
        setAIMode,
        setZoomStyle,
        setFocusSubject,
        setCropX,
        uploadAndProcess,
        download,
        reset,
        jobId,
        stageLogs,
    } = useReframeProcessing();

    const isProcessing = status === 'uploading' || status === 'processing';

    return (
        <main className="min-h-screen bg-gradient-to-br from-background via-background to-purple-950/10 py-8 px-4">
            <div className="container mx-auto max-w-7xl">
                {/* ─── Page Header ─── */}
                <div className="mb-8">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-purple-500 transition-colors mb-4"
                    >
                        <ArrowLeft className="size-4" />
                        Back to Tools
                    </Link>

                    <div className="flex items-start gap-4">
                        <div className="size-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                            <div className="relative">
                                <Monitor className="size-5 text-blue-400 absolute -left-1 -top-0.5 opacity-60" />
                                <Smartphone className="size-5 text-purple-500 relative left-1 top-0.5" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                                Reframe Video
                            </h1>
                            <p className="text-muted-foreground mt-1 text-sm md:text-base max-w-xl">
                                Convert horizontal videos to vertical format — perfectly optimized for TikTok, Instagram Reels, and YouTube Shorts
                            </p>
                        </div>
                    </div>
                </div>

                {/* ─── Main Content ─── */}
                {/* ─── Upload (first step) ─── */}
                {!file && (
                    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm max-w-3xl mx-auto">
                        <ReframeUpload
                            onFileSelect={selectFile}
                            file={file}
                            disabled={isProcessing}
                        />
                    </div>
                )}

                {/* ─── Opus-like layout ─── */}
                {file && previewUrl && (
                    <div className="mt-6 space-y-5">
                        <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
                            {/* LEFT (≈70%): preview + overlay */}
                            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="flex items-center gap-2">
                                        <Monitor className="size-4 text-blue-400" />
                                        <span className="text-sm font-semibold text-foreground">
                                            Live Preview
                                        </span>
                                    </div>
                                    <div className="ml-auto flex items-center gap-2">
                                        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                            {file.name.length > 28 ? file.name.slice(0, 25) + '...' : file.name}
                                        </span>
                                        {!isProcessing && (
                                            <button
                                                onClick={reset}
                                                className="text-[11px] text-muted-foreground hover:text-red-400 transition-colors"
                                            >
                                                Change
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <VideoPreviewWithOverlay
                                    videoUrl={previewUrl}
                                    jobId={jobId}
                                    ratio={settings.ratio}
                                    meta={meta}
                                    aiMode={settings.aiMode}
                                />

                                {/* Manual adjust only when aiMode=manual */}
                                {settings.aiMode === 'manual' && (
                                    <div className="mt-5">
                                        <CropAdjuster
                                            videoUrl={previewUrl}
                                            meta={meta || { width: 1920, height: 1080, duration: 0, codec: '', fps: 30 }}
                                            cropX={settings.cropX}
                                            ratio={settings.ratio}
                                            autoCenter={false}
                                            onCropXChange={setCropX}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* RIGHT (≈30%): controls */}
                            <div className="lg:sticky lg:top-20 lg:self-start">
                                <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                                    <div className="flex items-center gap-2 mb-5">
                                        <Smartphone className="size-4 text-purple-500" />
                                        <h2 className="text-lg font-bold text-foreground">AI Reframe</h2>
                                    </div>

                                    <ReframeControls
                                        ratio={settings.ratio}
                                        aiMode={settings.aiMode}
                                        zoomStyle={settings.zoomStyle}
                                        focusSubjectId={settings.focusSubjectId}
                                        status={status}
                                        hasFile={!!file}
                                        progress={progress}
                                        error={error}
                                        downloadReady={downloadReady}
                                        onRatioChange={setRatio}
                                        onAIModeChange={setAIMode}
                                        onZoomStyleChange={setZoomStyle}
                                        onFocusSubjectChange={setFocusSubject}
                                        onProcess={uploadAndProcess}
                                        onDownload={download}
                                        onReset={reset}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM: progress + stage logs */}
                        <ReframeProgress
                            status={status}
                            progress={progress}
                            error={error}
                            logs={stageLogs}
                        />
                    </div>
                )}
            </div>
        </main>
    );
}
