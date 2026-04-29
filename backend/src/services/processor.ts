import { Worker, Job as BullJob } from 'bullmq';
import axios from 'axios';
import { config } from '../config';
import { progressService } from './progress';

let worker: Worker | null = null;

/** Helper to update both BullMQ progress and the SSE progress service.
 *  Sends a STRUCTURED progress object so QueueEvents.on('progress', ...) in
 *  queue.ts can fan it out to SSE subscribers verbatim across processes. */
function emitProgress(job: BullJob, percent: number, stage: string, message: string) {
    const jobId = job.data.jobId || job.id!;
    job.updateProgress({ percent, stage, message });
    progressService.update(jobId, percent, stage, message);
    console.log(`   📊 [${percent}%] ${stage}: ${message}`);
}

async function processVideoJob(job: BullJob) {
    const { jobId, videoPath } = job.data;

    // Helper: check if job was cancelled (removed or moved to failed by user)
    async function checkCancelled() {
        const state = await job.getState();
        if (state === 'failed' || state === 'unknown') {
            throw new Error('Job cancelled by user');
        }
    }

    console.log(`\n🔄 ====== PROCESSING JOB ${jobId} ======`);
    console.log(`   [PIPELINE] Worker started job: ${jobId}`);
    console.log(`   [PIPELINE] Video path: ${videoPath}`);

    emitProgress(job, 5, 'initializing', 'Starting video processing...');

    await checkCancelled();

    // Step 1: Check AI service health
    try {
        console.log(`   [PIPELINE] Checking AI service health at ${config.aiServiceUrl}...`);
        const healthRes = await axios.get(`${config.aiServiceUrl}/health`, { timeout: 5000 });
        console.log(`   [PIPELINE] AI service health: ${healthRes.data.status} (busy: ${healthRes.data.busy})`);
    } catch (healthErr: any) {
        console.warn(`   [PIPELINE] ⚠️ AI service health check failed: ${healthErr.message}`);
        // Continue anyway — the actual call will provide a better error
    }

    // Step 2: Try multimodal highlight analysis first
    try {
        await checkCancelled();
        console.log('   [PIPELINE] Attempting multimodal highlight analysis...');
        emitProgress(job, 10, 'analyzing', 'Starting AI multimodal analysis...');

        console.log(`   [PIPELINE] Calling AI service: POST ${config.aiServiceUrl}/analyze-highlights`);
        const highlightResponse = await axios.post(
            `${config.aiServiceUrl}/analyze-highlights`,
            {
                jobId,
                videoPath,
                category: 'podcast',  // hardcoded default — contentType removed
                maxClips: 10,
            },
            { timeout: 600000 } // 10 minutes for full analysis
        );

        console.log(`   [PIPELINE] AI service response received: success=${highlightResponse.data.success}`);

        if (highlightResponse.data.success) {
            emitProgress(job, 100, 'completed', 'Multimodal analysis complete!');
            console.log(`   [PIPELINE] Job ${jobId} COMPLETED (multimodal analysis)`);
            console.log(`   ✅ Job ${jobId} DONE (multimodal analysis)\n`);

            // Clean up progress after a delay
            setTimeout(() => progressService.remove(jobId), 300000);

            return {
                mode: 'multimodal',
                highlights: highlightResponse.data.highlights,
                metadata: highlightResponse.data.metadata,
                analysisPath: highlightResponse.data.analysisPath,
                // Include legacy-compatible paths so clips route can find them
                transcriptPath: highlightResponse.data.transcriptPath,
                audioPath: highlightResponse.data.audioPath,
            };
        }
    } catch (highlightError: any) {
        console.warn(`   [PIPELINE] ⚠️ Multimodal analysis unavailable: ${highlightError.message}`);
        console.warn('   [PIPELINE] Falling back to legacy transcription...');
    }

    // Step 3: Fallback — legacy transcription-only mode
    await checkCancelled();
    emitProgress(job, 15, 'extracting_audio', 'Extracting audio from video...');
    console.log(`   [PIPELINE] Starting legacy transcription flow`);

    // The AI service handles audio extraction + transcription in one call
    // We simulate intermediate stages based on typical timing
    emitProgress(job, 25, 'transcribing', 'Sending to AI transcription service...');

    // Start a progress simulation while waiting for the AI service
    // This gives the user visual feedback during the long transcription call
    let simulatedProgress = 25;
    const progressTimer = setInterval(() => {
        if (simulatedProgress < 85) {
            simulatedProgress += 3;
            const msg = simulatedProgress < 40
                ? 'Transcribing audio with AI...'
                : simulatedProgress < 60
                    ? 'Processing speech segments...'
                    : simulatedProgress < 75
                        ? 'Analyzing transcript content...'
                        : 'Finalizing transcription...';
            emitProgress(job, simulatedProgress, 'transcribing', msg);
        }
    }, 5000); // Tick every 5 seconds

    try {
        console.log(`   [PIPELINE] Calling AI service: POST ${config.aiServiceUrl}/transcribe`);
        const response = await axios.post(
            `${config.aiServiceUrl}/transcribe`,
            { jobId, videoPath },
            { timeout: config.aiRequestTimeoutMs }
        );

        clearInterval(progressTimer);

        console.log(`   [PIPELINE] AI service response received: success=${response.data.success}`);

        if (!response.data.success) {
            const errMsg = response.data.error || 'AI service returned unsuccessful response';
            console.error(`   [PIPELINE] ❌ AI service error: ${errMsg}`);
            emitProgress(job, 0, 'failed', errMsg);
            throw new Error(errMsg);
        }

        console.log(`   [PIPELINE] Transcript saved to: ${response.data.transcriptPath}`);
        console.log(`   [PIPELINE] Audio saved to: ${response.data.audioPath}`);

        emitProgress(job, 90, 'saving', 'Saving transcription results...');
        emitProgress(job, 100, 'completed', 'Transcription complete!');
        console.log(`   [PIPELINE] Job ${jobId} COMPLETED (legacy transcription)`);
        console.log(`   ✅ Job ${jobId} DONE (legacy transcription)\n`);

        // Clean up progress after a delay
        setTimeout(() => progressService.remove(jobId), 300000);

        return {
            mode: 'legacy',
            audioPath: response.data.audioPath,
            transcriptPath: response.data.transcriptPath,
        };
    } catch (error: any) {
        clearInterval(progressTimer);
        const jobId = job.data.jobId || job.id!;
        const errMsg = error.message || 'Unknown processing error';
        console.error(`   [PIPELINE] ❌ Job ${jobId} FAILED: ${errMsg}`);
        progressService.update(jobId, 0, 'failed', errMsg);
        throw error;
    }
}

export const jobProcessor = {
    start() {
        worker = new Worker('video-processing', processVideoJob, {
            connection: config.redis,
            concurrency: 1,
        });

        worker.on('completed', (job) => {
            console.log(`✅ [BullMQ] Job ${job.id} completed`);
        });

        worker.on('failed', (job, err) => {
            console.error(`❌ [BullMQ] Job ${job?.id} failed: ${err.message}`);
            if (job) {
                const jobId = job.data.jobId || job.id!;
                progressService.update(jobId, 0, 'failed', err.message);
            }
        });

        worker.on('error', (err) => {
            console.error('❌ [BullMQ] Worker error:', err.message);
        });

        console.log('✅ BullMQ Worker started (queue: video-processing)');
    },

    async stop() {
        if (worker) {
            await worker.close();
            worker = null;
        }
        console.log('✅ BullMQ Worker stopped');
    },
};
