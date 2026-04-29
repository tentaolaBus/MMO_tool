import { Queue, Worker, Job as BullJob } from 'bullmq';
import { config } from '../config';
import { progressService } from './progress';
import { videoReframer, ReframeSettings } from './videoReframer';

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
export async function addReframeJob(
    jobId: string,
    videoPath: string,
    settings: ReframeSettings
) {
    console.log(`[PIPELINE] 📐 Reframe job added to queue: ${jobId}`);
    return reframeQueue.add(
        'reframe-video',
        { jobId, videoPath, settings },
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
    job.updateProgress(percent);
    progressService.update(jobId, percent, stage, message);
    console.log(`   📊 [Reframe ${percent}%] ${stage}: ${message}`);
}

/**
 * Process a single reframe job.
 */
async function processReframeJob(job: BullJob) {
    const { jobId, videoPath, settings } = job.data;

    console.log(`\n🔄 ====== REFRAME JOB ${jobId} ======`);
    console.log(`   [PIPELINE] Worker started reframe job: ${jobId}`);
    console.log(`   [PIPELINE] Video: ${videoPath}`);
    console.log(`   Ratio: ${settings.ratio}`);
    console.log(`   Auto-center: ${settings.autoCenter}`);
    console.log(`   CropX: ${settings.cropX}`);

    emitProgress(job, 5, 'initializing', 'Starting video reframing...');

    try {
        // Probe
        emitProgress(job, 8, 'probing', 'Analyzing video dimensions...');
        const meta = await videoReframer.probeVideo(videoPath);

        emitProgress(job, 10, 'validating', `Video: ${meta.width}×${meta.height}, ${meta.duration.toFixed(1)}s`);

        // Validate
        const validation = videoReframer.validateForReframe(meta);
        if (!validation.valid) {
            emitProgress(job, 0, 'failed', validation.reason!);
            throw new Error(validation.reason);
        }

        // Reframe with progress
        emitProgress(job, 15, 'reframing', 'Cropping and scaling video...');

        const outputPath = await videoReframer.reframe(
            videoPath,
            jobId,
            settings,
            (percent) => {
                const stage = percent < 50 ? 'reframing' : percent < 90 ? 'encoding' : 'finalizing';
                const msg = percent < 50
                    ? 'Cropping and scaling video...'
                    : percent < 90
                        ? 'Encoding output video...'
                        : 'Finalizing...';
                emitProgress(job, percent, stage, msg);
            }
        );

        emitProgress(job, 100, 'completed', 'Reframing complete!');
        console.log(`   [PIPELINE] Reframe job ${jobId} COMPLETED`);
        console.log(`   ✅ Reframe job ${jobId} DONE\n`);

        // Clean up progress after a delay
        setTimeout(() => progressService.remove(jobId), 60000);

        return { outputPath, meta };
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
