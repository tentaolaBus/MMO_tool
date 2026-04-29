'use client';

import { useReframeProcessing } from '@/features/video-reframing';
import ReframeUpload from '@/components/reframe/ReframeUpload';
import CropAdjuster from '@/components/reframe/CropAdjuster';
import ReframePreview from '@/components/reframe/ReframePreview';
import ReframeControls from '@/components/reframe/ReframeControls';
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
        toggleAutoCenter,
        setCropX,
        uploadAndProcess,
        download,
        reset,
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
                <div className="grid lg:grid-cols-[1fr_340px] gap-6">
                    {/* ─── Left Column: Upload + Preview ─── */}
                    <div className="space-y-6">
                        {/* Upload Zone */}
                        {!file && (
                            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                                <ReframeUpload
                                    onFileSelect={selectFile}
                                    file={file}
                                    disabled={isProcessing}
                                />
                            </div>
                        )}

                        {/* Crop Adjuster (Before) */}
                        {file && previewUrl && (
                            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="flex items-center gap-2">
                                        <Monitor className="size-4 text-blue-400" />
                                        <span className="text-sm font-semibold text-foreground">
                                            Original — {meta ? `${meta.width}×${meta.height}` : 'Loading...'}
                                        </span>
                                    </div>

                                    {/* File info pill */}
                                    <div className="ml-auto flex items-center gap-2">
                                        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                            {file.name.length > 25 ? file.name.slice(0, 22) + '...' : file.name}
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

                                <CropAdjuster
                                    videoUrl={previewUrl}
                                    meta={meta || { width: 1920, height: 1080, duration: 0, codec: '', fps: 30 }}
                                    cropX={settings.cropX}
                                    ratio={settings.ratio}
                                    autoCenter={settings.autoCenter}
                                    onCropXChange={setCropX}
                                />
                            </div>
                        )}

                        {/* Output Preview (After) */}
                        {file && previewUrl && (
                            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <Smartphone className="size-4 text-purple-500" />
                                    <span className="text-sm font-semibold text-foreground">
                                        Preview After Reframe
                                    </span>
                                </div>

                                <ReframePreview
                                    videoUrl={previewUrl}
                                    meta={meta || { width: 1920, height: 1080, duration: 0, codec: '', fps: 30 }}
                                    cropX={settings.cropX}
                                    ratio={settings.ratio}
                                    autoCenter={settings.autoCenter}
                                />
                            </div>
                        )}
                    </div>

                    {/* ─── Right Column: Controls ─── */}
                    <div className="lg:sticky lg:top-20 lg:self-start">
                        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                            <h2 className="text-lg font-bold text-foreground mb-5">
                                Settings
                            </h2>

                            <ReframeControls
                                ratio={settings.ratio}
                                autoCenter={settings.autoCenter}
                                status={status}
                                hasFile={!!file}
                                progress={progress}
                                error={error}
                                downloadReady={downloadReady}
                                onRatioChange={setRatio}
                                onToggleAutoCenter={toggleAutoCenter}
                                onProcess={uploadAndProcess}
                                onDownload={download}
                                onReset={reset}
                            />
                        </div>

                        {/* ─── Info Card ─── */}
                        <div className="mt-4 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-2xl border border-purple-500/10 p-5">
                            <h3 className="text-sm font-semibold text-foreground mb-2">
                                How it works
                            </h3>
                            <ul className="space-y-2 text-xs text-muted-foreground">
                                <li className="flex gap-2">
                                    <span className="text-purple-500 font-bold">1.</span>
                                    Upload a horizontal video (16:9 or similar)
                                </li>
                                <li className="flex gap-2">
                                    <span className="text-purple-500 font-bold">2.</span>
                                    Choose output ratio and adjust crop position
                                </li>
                                <li className="flex gap-2">
                                    <span className="text-purple-500 font-bold">3.</span>
                                    Click &quot;Reframe Video&quot; to process
                                </li>
                                <li className="flex gap-2">
                                    <span className="text-purple-500 font-bold">4.</span>
                                    Download your perfectly cropped vertical video
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
