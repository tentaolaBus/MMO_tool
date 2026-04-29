    import { Queue, Job as BullJob, QueueEvents } from 'bullmq';
import { config } from '../config';
import { releaseJob } from '../middleware/rateLimiter';
import { progressService } from './progress';

export const videoQueue = new Queue('video-processing', {
    connection: config.redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
    },
});

// ─── Queue event logging ─────────────────────────────────────────────────

const queueEvents = new QueueEvents('video-processing', {
    connection: config.redis,
});

queueEvents.on('waiting', ({ jobId }) => {
    console.log(`[PIPELINE] ⏳ Job ${jobId} → WAITING in queue`);
});

queueEvents.on('active', ({ jobId }) => {
    console.log(`[PIPELINE] ▶️  Job ${jobId} → ACTIVE (worker picked up)`);
});

// ─── Progress fan-out ─────────────────────────────────────────────────
// BullMQ fires `progress` whenever the worker calls job.updateProgress(...).
// We bridge those events into the in-memory progressService so any SSE
// subscriber on this API process gets pushed updates — even if the worker
// runs in a different process.
queueEvents.on('progress', ({ jobId, data }) => {
    if (typeof data === 'number') {
        progressService.update(jobId, data, 'processing', `Processing ${data}%`);
    } else if (data && typeof data === 'object') {
        const d = data as { percent?: number; stage?: string; message?: string };
        progressService.update(
            jobId,
            d.percent ?? 0,
            d.stage ?? 'processing',
            d.message ?? '',
        );
    }
});

queueEvents.on('completed', ({ jobId }) => {
    console.log(`[PIPELINE] ✅ Job ${jobId} → COMPLETED`);
    progressService.update(jobId, 100, 'completed', 'Processing complete');
    releaseAllIpsForJob(jobId);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[PIPELINE] ❌ Job ${jobId} → FAILED: ${failedReason}`);
    progressService.update(jobId, 0, 'failed', failedReason || 'Processing failed');
    releaseAllIpsForJob(jobId);
});

// ─── IP-to-job tracking (for releasing on complete/fail) ─────────────
// We store which IP started which job so we can release it automatically.
const jobIpMap = new Map<string, string>();

export function registerJobIp(jobId: string, ip: string): void {
    jobIpMap.set(jobId, ip);
}

function releaseAllIpsForJob(jobId: string): void {
    const ip = jobIpMap.get(jobId);
    if (ip) {
        releaseJob(ip, jobId);
        jobIpMap.delete(jobId);
        console.log(`[PIPELINE] 🔓 Released concurrent slot for IP ${ip} (job ${jobId})`);
    }
}

// ─── Queue operations ────────────────────────────────────────────────────

export async function addVideoJob(jobId: string, videoPath: string) {
    console.log(`[PIPELINE] 📦 Adding job to queue: ${jobId}`);
    console.log(`[PIPELINE]    videoPath: ${videoPath}`);

    const job = await videoQueue.add(
        'process-video',
        { jobId, videoPath },
        { jobId }
    );

    console.log(`[PIPELINE] ✅ Job added to queue: ${job.id}`);
    return job;
}

export async function getVideoJob(jobId: string): Promise<BullJob | undefined> {
    const job = await videoQueue.getJob(jobId);
    return job ?? undefined;
}

export async function getAllVideoJobs() {
    const [waiting, active, completed, failed] = await Promise.all([
        videoQueue.getWaiting(),
        videoQueue.getActive(),
        videoQueue.getCompleted(),
        videoQueue.getFailed(),
    ]);
    return { waiting, active, completed, failed };
}

/**
 * Remove a job from the queue and release the concurrent slot.
 * Used by the cleanup endpoint and "cancel" flow.
 */
export async function removeJob(jobId: string): Promise<boolean> {
    try {
        const job = await videoQueue.getJob(jobId);
        if (job) {
            const state = await job.getState();
            // Only remove if not currently active (active jobs can't be safely removed)
            if (state !== 'active') {
                await job.remove();
                console.log(`[PIPELINE] 🗑️ Job ${jobId} removed from queue (was ${state})`);
            } else {
                // For active jobs, move to failed state to stop processing
                await job.moveToFailed(new Error('Cancelled by user'), 'cancel-token', true);
                console.log(`[PIPELINE] 🛑 Active job ${jobId} cancelled`);
            }
        }
        // Always release the IP slot
        releaseAllIpsForJob(jobId);
        return true;
    } catch (err: any) {
        console.error(`[PIPELINE] ❌ Failed to remove job ${jobId}: ${err.message}`);
        return false;
    }
}

// ─── Progress shape helpers ──────────────────────────────────────────────
// BullMQ's `job.progress` is `unknown` at the API boundary: workers can write
// either a number OR a structured object (we now write the object form).
// EVERY backend reader MUST go through readJobProgress() — never read
// `job.progress` directly. Casting to `as number` will silently leak the
// object into Supabase (INTEGER column) and into the JSON API response.

export interface JobProgress {
    percent: number;     // 0-100
    stage: string;       // e.g. 'uploading' | 'analyzing' | 'completed' | 'failed'
    message: string;
}

export function readJobProgress(raw: unknown): JobProgress {
    if (typeof raw === 'number') {
        return { percent: raw, stage: 'processing', message: `Processing ${raw}%` };
    }
    if (raw && typeof raw === 'object') {
        const o = raw as Partial<JobProgress>;
        return {
            percent: typeof o.percent === 'number' ? o.percent : 0,
            stage: typeof o.stage === 'string' ? o.stage : 'processing',
            message: typeof o.message === 'string' ? o.message : '',
        };
    }
    return { percent: 0, stage: 'processing', message: '' };
}
