"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoQueue = void 0;
exports.registerJobIp = registerJobIp;
exports.addVideoJob = addVideoJob;
exports.getVideoJob = getVideoJob;
exports.getAllVideoJobs = getAllVideoJobs;
exports.removeJob = removeJob;
exports.readJobProgress = readJobProgress;
const bullmq_1 = require("bullmq");
const config_1 = require("../config");
const rateLimiter_1 = require("../middleware/rateLimiter");
const progress_1 = require("./progress");
exports.videoQueue = new bullmq_1.Queue('video-processing', {
    connection: config_1.config.redis,
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
const queueEvents = new bullmq_1.QueueEvents('video-processing', {
    connection: config_1.config.redis,
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
        progress_1.progressService.update(jobId, data, 'processing', `Processing ${data}%`);
    }
    else if (data && typeof data === 'object') {
        const d = data;
        progress_1.progressService.update(jobId, d.percent ?? 0, d.stage ?? 'processing', d.message ?? '');
    }
});
queueEvents.on('completed', ({ jobId }) => {
    console.log(`[PIPELINE] ✅ Job ${jobId} → COMPLETED`);
    progress_1.progressService.update(jobId, 100, 'completed', 'Processing complete');
    releaseAllIpsForJob(jobId);
});
queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[PIPELINE] ❌ Job ${jobId} → FAILED: ${failedReason}`);
    progress_1.progressService.update(jobId, 0, 'failed', failedReason || 'Processing failed');
    releaseAllIpsForJob(jobId);
});
// ─── IP-to-job tracking (for releasing on complete/fail) ─────────────
// We store which IP started which job so we can release it automatically.
const jobIpMap = new Map();
function registerJobIp(jobId, ip) {
    jobIpMap.set(jobId, ip);
}
function releaseAllIpsForJob(jobId) {
    const ip = jobIpMap.get(jobId);
    if (ip) {
        (0, rateLimiter_1.releaseJob)(ip, jobId);
        jobIpMap.delete(jobId);
        console.log(`[PIPELINE] 🔓 Released concurrent slot for IP ${ip} (job ${jobId})`);
    }
}
// ─── Queue operations ────────────────────────────────────────────────────
async function addVideoJob(jobId, videoPath) {
    console.log(`[PIPELINE] 📦 Adding job to queue: ${jobId}`);
    console.log(`[PIPELINE]    videoPath: ${videoPath}`);
    const job = await exports.videoQueue.add('process-video', { jobId, videoPath }, { jobId });
    console.log(`[PIPELINE] ✅ Job added to queue: ${job.id}`);
    return job;
}
async function getVideoJob(jobId) {
    const job = await exports.videoQueue.getJob(jobId);
    return job ?? undefined;
}
async function getAllVideoJobs() {
    const [waiting, active, completed, failed] = await Promise.all([
        exports.videoQueue.getWaiting(),
        exports.videoQueue.getActive(),
        exports.videoQueue.getCompleted(),
        exports.videoQueue.getFailed(),
    ]);
    return { waiting, active, completed, failed };
}
/**
 * Remove a job from the queue and release the concurrent slot.
 * Used by the cleanup endpoint and "cancel" flow.
 */
async function removeJob(jobId) {
    try {
        const job = await exports.videoQueue.getJob(jobId);
        if (job) {
            const state = await job.getState();
            // Only remove if not currently active (active jobs can't be safely removed)
            if (state !== 'active') {
                await job.remove();
                console.log(`[PIPELINE] 🗑️ Job ${jobId} removed from queue (was ${state})`);
            }
            else {
                // For active jobs, move to failed state to stop processing
                await job.moveToFailed(new Error('Cancelled by user'), 'cancel-token', true);
                console.log(`[PIPELINE] 🛑 Active job ${jobId} cancelled`);
            }
        }
        // Always release the IP slot
        releaseAllIpsForJob(jobId);
        return true;
    }
    catch (err) {
        console.error(`[PIPELINE] ❌ Failed to remove job ${jobId}: ${err.message}`);
        return false;
    }
}
function readJobProgress(raw) {
    if (typeof raw === 'number') {
        return { percent: raw, stage: 'processing', message: `Processing ${raw}%` };
    }
    if (raw && typeof raw === 'object') {
        const o = raw;
        return {
            percent: typeof o.percent === 'number' ? o.percent : 0,
            stage: typeof o.stage === 'string' ? o.stage : 'processing',
            message: typeof o.message === 'string' ? o.message : '',
        };
    }
    return { percent: 0, stage: 'processing', message: '' };
}
