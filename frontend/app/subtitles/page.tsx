'use client';

import { useSubtitleProcessing } from '@/features/video-subtitles';
import SubtitleUpload from '@/components/subtitles/SubtitleUpload';
import SubtitleVideoPlayer from '@/components/subtitles/SubtitleVideoPlayer';
import SubtitleTimeline from '@/components/subtitles/SubtitleTimeline';
import SubtitleStylePanel from '@/components/subtitles/SubtitleStylePanel';
import { ArrowLeft, Type, Loader2, Download, RotateCcw, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function SubtitlesPage() {
    const {
        file, previewUrl, segments, style, subtitleEnabled,
        status, error, progress, currentTime,
        selectFile, generateSubtitles,
        updateSegment, deleteSegment, addSegment,
        setStyle, setSubtitleEnabled,
        setCurrentTime, exportVideo, reset,
    } = useSubtitleProcessing();

    const isProcessing = status === 'uploading' || status === 'generating' || status === 'exporting';
    const hasSegments = segments.length > 0;

    return (
        <main className="min-h-screen bg-gradient-to-br from-background via-background to-amber-950/10 py-8 px-4">
            <div className="container mx-auto max-w-7xl">
                {/* ─── Page Header ─── */}
                <div className="mb-8">
                    <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-amber-500 transition-colors mb-4">
                        <ArrowLeft className="size-4" /> Back to Tools
                    </Link>
                    <div className="flex items-start gap-4">
                        <div className="size-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center flex-shrink-0">
                            <Type className="size-6 text-amber-500" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Auto Subtitles</h1>
                            <p className="text-muted-foreground mt-1 text-sm md:text-base max-w-xl">
                                Generate subtitles automatically, edit text & timing, customize style, and export with burned-in captions
                            </p>
                        </div>
                    </div>
                </div>

                {/* ─── Upload State ─── */}
                {!file && (
                    <div className="max-w-2xl mx-auto">
                        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
                            <SubtitleUpload onFileSelect={selectFile} file={file} disabled={isProcessing} />

                            <div className="mt-6 p-4 bg-gradient-to-br from-amber-500/5 to-orange-500/5 rounded-xl border border-amber-500/10">
                                <h3 className="text-sm font-semibold text-foreground mb-2">How it works</h3>
                                <ol className="space-y-1.5 text-xs text-muted-foreground">
                                    <li className="flex gap-2"><span className="text-amber-500 font-bold">1.</span> Upload a video with speech</li>
                                    <li className="flex gap-2"><span className="text-amber-500 font-bold">2.</span> AI generates subtitles automatically</li>
                                    <li className="flex gap-2"><span className="text-amber-500 font-bold">3.</span> Edit text, adjust timing, pick a style</li>
                                    <li className="flex gap-2"><span className="text-amber-500 font-bold">4.</span> Export video with burned-in captions</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── Main Editor (after file selected) ─── */}
                {file && (
                    <div className="grid lg:grid-cols-[1fr_380px] gap-6">
                        {/* ─── Left Column: Video + Timeline ─── */}
                        <div className="space-y-6">
                            {/* Video Player */}
                            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Type className="size-4 text-amber-500" />
                                        <span className="text-sm font-semibold text-foreground">Preview</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full truncate max-w-[200px]">
                                            {file.name}
                                        </span>
                                        {!isProcessing && (
                                            <button onClick={reset} className="text-[11px] text-muted-foreground hover:text-red-400 transition-colors">
                                                Change
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <SubtitleVideoPlayer
                                    videoUrl={previewUrl}
                                    segments={segments}
                                    style={style}
                                    subtitleEnabled={subtitleEnabled}
                                    currentTime={currentTime}
                                    onTimeUpdate={setCurrentTime}
                                />
                            </div>

                            {/* Generate button (no segments yet) */}
                            {!hasSegments && !isProcessing && status !== 'ready' && (
                                <div className="bg-card rounded-2xl border border-border p-6 shadow-sm text-center">
                                    <Sparkles className="size-8 text-amber-500 mx-auto mb-3" />
                                    <h3 className="text-lg font-bold text-foreground mb-2">Ready to Generate Subtitles</h3>
                                    <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
                                        Our AI will transcribe the speech in your video and create editable subtitle segments.
                                    </p>
                                    <button
                                        onClick={generateSubtitles}
                                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                                    >
                                        <Sparkles className="size-4" /> Generate Subtitles
                                    </button>
                                </div>
                            )}

                            {/* Progress */}
                            {isProcessing && progress && (
                                <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-amber-500 flex items-center gap-2 text-sm">
                                            <Loader2 className="size-4 animate-spin" /> {progress.message}
                                        </span>
                                        <span className="font-bold text-amber-400 text-sm">{progress.percent}%</span>
                                    </div>
                                    <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                                        <div className="h-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-700 ease-out" style={{ width: `${progress.percent}%` }} />
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                                    <AlertCircle className="size-5 text-red-400 flex-shrink-0 mt-0.5" />
                                    <span className="text-sm text-red-400">{error}</span>
                                </div>
                            )}

                            {/* Subtitle Timeline */}
                            {hasSegments && (
                                <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                                    <SubtitleTimeline
                                        segments={segments}
                                        currentTime={currentTime}
                                        onSegmentClick={(seg) => setCurrentTime(seg.start)}
                                        onUpdateSegment={updateSegment}
                                        onDeleteSegment={deleteSegment}
                                        onAddSegment={addSegment}
                                        disabled={isProcessing}
                                    />
                                </div>
                            )}
                        </div>

                        {/* ─── Right Column: Style + Actions ─── */}
                        <div className="lg:sticky lg:top-20 lg:self-start space-y-4">
                            {/* Style Panel */}
                            {hasSegments && (
                                <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                                    <h2 className="text-lg font-bold text-foreground mb-4">Subtitle Style</h2>
                                    <SubtitleStylePanel
                                        style={style}
                                        onChange={setStyle}
                                        enabled={subtitleEnabled}
                                        onEnabledChange={setSubtitleEnabled}
                                    />
                                </div>
                            )}

                            {/* Export Actions */}
                            {hasSegments && (
                                <div className="bg-card rounded-2xl border border-border p-5 shadow-sm space-y-3">
                                    {status === 'exported' ? (
                                        <>
                                            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                                                <CheckCircle2 className="size-5 text-green-500" />
                                                <span className="text-sm text-green-500 font-medium">Export complete!</span>
                                            </div>
                                            <button onClick={reset}
                                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-border text-muted-foreground hover:text-foreground hover:border-amber-400/40 font-medium text-sm transition-all">
                                                <RotateCcw className="size-4" /> New Video
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={exportVideo}
                                            disabled={isProcessing || !hasSegments}
                                            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all shadow-md active:scale-[0.98] ${
                                                isProcessing || !hasSegments
                                                    ? 'bg-muted text-muted-foreground cursor-not-allowed shadow-none'
                                                    : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white hover:shadow-lg'
                                            }`}
                                        >
                                            {status === 'exporting' ? (
                                                <><Loader2 className="size-4 animate-spin" /> Exporting...</>
                                            ) : (
                                                <><Download className="size-4" /> Export Video with Subtitles</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
