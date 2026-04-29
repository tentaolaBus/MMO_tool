import { Queue, Worker, Job as BullJob } from 'bullmq';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { progressService } from './progress';

/**
 * BullMQ Queue for subtitle generation jobs.
 * Makes transcription non-blocking — the request returns immediately.
 */
export const subtitleQueue = new Queue('subtitle-processing', {
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
 * Add a subtitle job to the queue.
 */
export async function addSubtitleJob(jobId: string, videoPath: string) {
    console.log(`[PIPELINE] 📝 Subtitle job added to queue: ${jobId}`);
    return subtitleQueue.add(
        'generate-subtitles',
        { jobId, videoPath },
        { jobId }
    );
}

/**
 * Get a subtitle job by ID.
 */
export async function getSubtitleJob(jobId: string) {
    const job = await subtitleQueue.getJob(jobId);
    return job ?? undefined;
}

// ─── Worker ──────────────────────────────────────────────────────────

let worker: Worker | null = null;

function emitProgress(job: BullJob, percent: number, stage: string, message: string) {
    const jobId = job.data.jobId || job.id!;
    job.updateProgress(percent);
    progressService.update(jobId, percent, stage, message);
    console.log(`   📊 [Subtitle ${percent}%] ${stage}: ${message}`);
}

/**
 * Process a single subtitle job.
 */
async function processSubtitleJob(job: BullJob) {
    const { jobId, videoPath } = job.data;

    console.log(`\n📝 ====== SUBTITLE JOB ${jobId} ======`);
    console.log(`   Video: ${videoPath}`);

    emitProgress(job, 5, 'initializing', 'Starting subtitle generation...');

    try {
        // Step 1: Check AI service health
        emitProgress(job, 8, 'checking', 'Checking AI service...');
        try {
            const healthRes = await axios.get(`${config.aiServiceUrl}/health`, { timeout: 5000 });
            console.log(`   [PIPELINE] AI service health: ${healthRes.data.status}`);
            if (healthRes.data.busy) {
                console.log(`   [PIPELINE] AI service is busy with job: ${healthRes.data.current_job}`);
            }
        } catch (healthErr: any) {
            const errMsg = `AI service unreachable at ${config.aiServiceUrl}: ${healthErr.message}`;
            console.error(`   [PIPELINE] ❌ ${errMsg}`);
            emitProgress(job, 0, 'failed', errMsg);
            throw new Error(errMsg);
        }

        // Step 2: Call AI transcription
        emitProgress(job, 15, 'transcribing', 'Sending to AI transcription...');
        console.log(`   [PIPELINE] Calling AI service: POST ${config.aiServiceUrl}/transcribe`);

        const response = await axios.post(
            `${config.aiServiceUrl}/transcribe`,
            { jobId, videoPath },
            { timeout: config.aiRequestTimeoutMs }
        );

        console.log(`   [PIPELINE] AI service response: success=${response.data.success}`);

        if (!response.data.success) {
            const errMsg = response.data.error || 'AI transcription failed';
            emitProgress(job, 0, 'failed', errMsg);
            throw new Error(errMsg);
        }

        emitProgress(job, 80, 'processing', 'Processing transcript...');

        // Step 3: Load and parse transcript
        const transcriptPath = response.data.transcriptPath
            || path.resolve('./storage/transcripts', `${jobId}.json`);

        if (!fs.existsSync(transcriptPath)) {
            const errMsg = 'Transcript file not found after AI processing';
            emitProgress(job, 0, 'failed', errMsg);
            throw new Error(errMsg);
        }

        const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
        const segments = (transcript.segments || []).map((seg: any) => ({
            start: seg.start,
            end: seg.end,
            text: seg.text?.trim() || '',
        }));

        // Step 4: Cache subtitles
        const subsDir = path.resolve('./storage/subtitles');
        if (!fs.existsSync(subsDir)) fs.mkdirSync(subsDir, { recursive: true });
        const subsPath = path.join(subsDir, `${jobId}_standalone_en.json`);
        fs.writeFileSync(
            subsPath,
            JSON.stringify({ jobId, language: 'en', segments, createdAt: new Date().toISOString() }, null, 2)
        );
        console.log(`   [PIPELINE] Subtitles saved: ${subsPath}`);

        emitProgress(job, 100, 'completed', 'Subtitles ready!');
        console.log(`   ✅ Subtitle job ${jobId} DONE (${segments.length} segments)\n`);

        setTimeout(() => progressService.remove(jobId), 60000);

        return {
            segments,
            duration: transcript.duration || 0,
            language: transcript.language || 'en',
            transcriptPath,
        };
    } catch (error: any) {
        const errMsg = error.message || 'Unknown subtitle error';
        emitProgress(job, 0, 'failed', errMsg);
        console.error(`   ❌ Subtitle job ${jobId} FAILED: ${errMsg}\n`);
        throw error;
    }
}

/**
 * Subtitle job processor — start/stop lifecycle.
 */
export const subtitleProcessor = {
    start() {
        worker = new Worker('subtitle-processing', processSubtitleJob, {
            connection: config.redis,
            concurrency: 1,
        });

        worker.on('completed', (job) => {
            console.log(`✅ [BullMQ:Subtitle] Job ${job.id} completed`);
        });

        worker.on('failed', (job, err) => {
            console.error(`❌ [BullMQ:Subtitle] Job ${job?.id} failed: ${err.message}`);
            if (job) {
                const jobId = job.data.jobId || job.id!;
                progressService.update(jobId, 0, 'failed', err.message);
            }
        });

        worker.on('error', (err) => {
            console.error('❌ [BullMQ:Subtitle] Worker error:', err.message);
        });

        console.log('✅ BullMQ Subtitle Worker started (queue: subtitle-processing)');
    },

    async stop() {
        if (worker) {
            await worker.close();
            worker = null;
        }
        console.log('✅ BullMQ Subtitle Worker stopped');
    },
};
