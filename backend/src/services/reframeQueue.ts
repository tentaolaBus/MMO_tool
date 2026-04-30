import { Queue, Worker, Job as BullJob } from 'bullmq';
import { config } from '../config';
import { progressService } from './progress';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { spawn } from 'child_process';
import { storageService } from './storage';
import { queries } from './database';

export interface ReframeJobPayload {
    clipId: string;
    videoUrl: string;
    targetAspectRatio: string; // e.g. '9:16'
}

/**
 * BullMQ Queue for video reframing jobs.
 * Isolated from the main video-processing queue to prevent blocking.
 */
export const reframeQueue = new Queue('video-reframing', {
    connection: config.redis,
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 25 },
    },
});

/**
 * Add a reframe job to the queue.
 */
export async function addReframeJob(jobId: string, payload: ReframeJobPayload) {
    console.log(`[PIPELINE] 📐 Reframe job added to queue: ${jobId}`);
    return reframeQueue.add(
        'reframe-video',
        { jobId, ...payload },
        { jobId }
    );
}

/**
 * Get a reframe job by ID.
 */
export async function getReframeJob(jobId: string) {
    const job = await reframeQueue.getJob(jobId);
    return job ?? undefined;
}

// ─── Worker ──────────────────────────────────────────────────────────

let worker: Worker | null = null;

/** Helper to update both BullMQ progress and the SSE progress service */
function emitProgress(job: BullJob, percent: number, stage: string, message: string) {
    const jobId = job.data.jobId || job.id!;
    // IMPORTANT: we write the structured object so SSE stage/message survives,
    // and queueEvents bridges it back to the API progressService.
    job.updateProgress({ percent, stage, message });
    progressService.update(jobId, percent, stage, message);
    console.log(`   📊 [Reframe ${percent}%] ${stage}: ${message}`);
}

function isProbablyHttpUrl(u: string): boolean {
    return /^https?:\/\//i.test(u);
}

function resolveStorageUrlToDiskPath(videoUrl: string): string | null {
    // Expect URLs like:
    // - /storage/clips/foo.mp4
    // - /storage/reframed/bar.mp4
    // Also tolerate full backend URL: http://host:port/storage/...
    const match = videoUrl.match(/\/storage\/(.+)$/i);
    if (!match) return null;
    const rel = match[1].replace(/\//g, path.sep);
    return path.resolve(config.storageDir, rel);
}

async function downloadToTemp(videoUrl: string, jobId: string): Promise<string> {
    const tempDir = path.resolve(config.storageDir, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const outPath = path.join(tempDir, `reframe_input_${jobId}.mp4`);

    const res = await axios.get(videoUrl, { responseType: 'stream', timeout: 120000 });
    await new Promise<void>((resolve, reject) => {
        const ws = fs.createWriteStream(outPath);
        res.data.pipe(ws);
        ws.on('finish', () => resolve());
        ws.on('error', reject);
    });
    return outPath;
}

function runPythonReframe(args: {
    inputPath: string;
    outputPath: string;
    clipId: string;
    targetAspectRatio: string;
    detectFps?: number;
    maxSide?: number;
    smoothingAlpha?: number;
    facePriority?: boolean;
    zoomMode?: 'auto' | 'none';
}, onProgress: (p: { percent: number; stage: string; message: string }) => void): Promise<{ outputPath: string; cropJsonPath?: string }> {
    const scriptPath = config.reframePipelinePath;
    const pythonBin = config.pythonBin;

    const argv = [
        scriptPath,
        '--input', args.inputPath,
        '--output', args.outputPath,
        '--clip-id', args.clipId,
        '--aspect', args.targetAspectRatio,
        '--emit-progress-json',
        '--detect-fps', String(args.detectFps ?? 8),
        '--max-side', String(args.maxSide ?? 960),
        '--alpha', String(args.smoothingAlpha ?? 0.25),
        '--zoom', args.zoomMode ?? 'auto',
    ];
    if (args.facePriority ?? true) argv.push('--face-priority');

    return new Promise((resolve, reject) => {
        const proc = spawn(pythonBin, argv, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        let buffer = '';
        proc.stdout.on('data', (d) => {
            buffer += d.toString();
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';
            for (const line of lines) {
                const s = line.trim();
                if (!s) continue;
                try {
                    const evt = JSON.parse(s);
                    if (evt && evt.type === 'progress') {
                        onProgress({
                            percent: Number(evt.percent ?? 0),
                            stage: String(evt.stage ?? 'processing'),
                            message: String(evt.message ?? ''),
                        });
                    }
                    if (evt && evt.type === 'result') {
                        // This is informational; final resolve happens on exit 0
                    }
                } catch {
                    // Allow plain logs through without crashing parsing
                    if (s.startsWith('[REFRAME]')) {
                        // helpful in worker logs
                        console.log('   ' + s);
                    }
                }
            }
        });

        proc.on('error', (err) => reject(err));

        proc.on('close', (code) => {
            if (code !== 0) {
                const msg = `Python reframe failed (exit ${code}). ${stderr.slice(-2000)}`;
                return reject(new Error(msg));
            }
            resolve({ outputPath: args.outputPath, cropJsonPath: args.outputPath.replace(/\.mp4$/i, '.crops.json') });
        });
    });
}

/**
 * Process a single reframe job.
 */
async function processReframeJob(job: BullJob) {
    const { jobId, clipId, videoUrl, targetAspectRatio } = job.data as {
        jobId: string;
        clipId: string;
        videoUrl: string;
        targetAspectRatio: string;
    };

    console.log(`\n🔄 ====== REFRAME JOB ${jobId} ======`);
    console.log(`   [PIPELINE] Worker started reframe job: ${jobId}`);
    console.log(`   [PIPELINE] clipId: ${clipId}`);
    console.log(`   [PIPELINE] videoUrl: ${videoUrl}`);
    console.log(`   [PIPELINE] targetAspectRatio: ${targetAspectRatio}`);

    emitProgress(job, 3, 'initializing', 'Starting AI reframing pipeline...');

    try {
        emitProgress(job, 8, 'resolving_input', 'Resolving input video...');

        let inputPath: string | null = null;
        if (!isProbablyHttpUrl(videoUrl)) {
            inputPath = resolveStorageUrlToDiskPath(videoUrl);
        }
        if (inputPath && !fs.existsSync(inputPath)) {
            console.warn(`   [PIPELINE] Resolved storage path missing: ${inputPath}`);
            inputPath = null;
        }
        if (!inputPath) {
            if (!isProbablyHttpUrl(videoUrl)) {
                throw new Error(`Unsupported videoUrl (expected /storage/... or http(s)://...): ${videoUrl}`);
            }
            emitProgress(job, 12, 'downloading', 'Downloading input video...');
            inputPath = await downloadToTemp(videoUrl, jobId);
        }

        const outputPath = storageService.getReframePath(clipId);
        const outDir = path.dirname(outputPath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        emitProgress(job, 18, 'analyzing', 'Analyzing video & detecting subject...');

        // Run Python pipeline (streams real progress frames back into BullMQ/SSE)
        await runPythonReframe(
            {
                inputPath,
                outputPath,
                clipId,
                targetAspectRatio: targetAspectRatio || '9:16',
                detectFps: 8,
                maxSide: 960,
                smoothingAlpha: 0.25,
                facePriority: true,
                zoomMode: 'auto',
            },
            ({ percent, stage, message }) => {
                // Python reports 0-100; map directly.
                emitProgress(job, Math.max(18, Math.min(99, percent)), stage, message);
            }
        );

        // Persist: replace clip video_path with reframed output
        emitProgress(job, 99, 'saving', 'Updating clip record...');
        try {
            await queries.updateClipVideoPath(outputPath, clipId);
        } catch (dbErr: any) {
            console.warn(`   [PIPELINE] ⚠️ Failed to update clip video_path in DB: ${dbErr.message}`);
        }

        const outputUrl = `/storage/reframed/${path.basename(outputPath)}`;

        emitProgress(job, 100, 'completed', 'AI reframing complete!');
        console.log(`   [PIPELINE] Reframe job ${jobId} COMPLETED`);
        console.log(`   ✅ Reframe job ${jobId} DONE\n`);

        // Clean up progress after a delay
        setTimeout(() => progressService.remove(jobId), 60000);

        return { clipId, outputPath, outputUrl, status: 'completed' };
    } catch (error: any) {
        const errMsg = error.message || 'Unknown reframe error';
        emitProgress(job, 0, 'failed', errMsg);
        console.error(`   ❌ Reframe job ${jobId} FAILED: ${errMsg}\n`);
        throw error;
    }
}

/**
 * Reframe job processor — start/stop lifecycle.
 */
export const reframeProcessor = {
    start() {
        worker = new Worker('video-reframing', processReframeJob, {
            connection: config.redis,
            concurrency: 1,
        });

        worker.on('completed', (job) => {
            console.log(`✅ [BullMQ:Reframe] Job ${job.id} completed`);
        });

        worker.on('failed', (job, err) => {
            console.error(`❌ [BullMQ:Reframe] Job ${job?.id} failed: ${err.message}`);
            if (job) {
                const jobId = job.data.jobId || job.id!;
                progressService.update(jobId, 0, 'failed', err.message);
            }
        });

        worker.on('error', (err) => {
            console.error('❌ [BullMQ:Reframe] Worker error:', err.message);
        });

        console.log('✅ BullMQ Reframe Worker started (queue: video-reframing)');
    },

    async stop() {
        if (worker) {
            await worker.close();
            worker = null;
        }
        console.log('✅ BullMQ Reframe Worker stopped');
    },
};
