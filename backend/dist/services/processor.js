"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobProcessor = void 0;
const bullmq_1 = require("bullmq");
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const progress_1 = require("./progress");
let worker = null;
/** Helper to update both BullMQ progress and the SSE progress service.
 *  Sends a STRUCTURED progress object so QueueEvents.on('progress', ...) in
 *  queue.ts can fan it out to SSE subscribers verbatim across processes. */
function emitProgress(job, percent, stage, message) {
    const jobId = job.data.jobId || job.id;
    job.updateProgress({ percent, stage, message });
    progress_1.progressService.update(jobId, percent, stage, message);
    console.log(`   📊 [${percent}%] ${stage}: ${message}`);
}
async function processVideoJob(job) {
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
        console.log(`   [PIPELINE] Checking AI service health at ${config_1.config.aiServiceUrl}...`);
        const healthRes = await axios_1.default.get(`${config_1.config.aiServiceUrl}/health`, { timeout: 5000 });
        console.log(`   [PIPELINE] AI service health: ${healthRes.data.status} (busy: ${healthRes.data.busy})`);
    }
    catch (healthErr) {
        console.warn(`   [PIPELINE] ⚠️ AI service health check failed: ${healthErr.message}`);
        // Continue anyway — the actual call will provide a better error
    }
    // Step 2: Try multimodal highlight analysis first
    try {
        await checkCancelled();
        console.log('   [PIPELINE] Attempting multimodal highlight analysis...');
        emitProgress(job, 10, 'analyzing', 'Starting AI multimodal analysis...');
        console.log(`   [PIPELINE] Calling AI service: POST ${config_1.config.aiServiceUrl}/analyze-highlights`);
        const highlightResponse = await axios_1.default.post(`${config_1.config.aiServiceUrl}/analyze-highlights`, {
            jobId,
            videoPath,
            category: 'podcast', // hardcoded default — contentType removed
            maxClips: 10,
        }, { timeout: 600000 } // 10 minutes for full analysis
        );
        console.log(`   [PIPELINE] AI service response received: success=${highlightResponse.data.success}`);
        if (highlightResponse.data.success) {
            emitProgress(job, 100, 'completed', 'Multimodal analysis complete!');
            console.log(`   [PIPELINE] Job ${jobId} COMPLETED (multimodal analysis)`);
            console.log(`   ✅ Job ${jobId} DONE (multimodal analysis)\n`);
            // Clean up progress after a delay
            setTimeout(() => progress_1.progressService.remove(jobId), 300000);
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
    }
    catch (highlightError) {
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
        console.log(`   [PIPELINE] Calling AI service: POST ${config_1.config.aiServiceUrl}/transcribe`);
        const response = await axios_1.default.post(`${config_1.config.aiServiceUrl}/transcribe`, { jobId, videoPath }, { timeout: config_1.config.aiRequestTimeoutMs });
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
        setTimeout(() => progress_1.progressService.remove(jobId), 300000);
        return {
            mode: 'legacy',
            audioPath: response.data.audioPath,
            transcriptPath: response.data.transcriptPath,
        };
    }
    catch (error) {
        clearInterval(progressTimer);
        const jobId = job.data.jobId || job.id;
        const errMsg = error.message || 'Unknown processing error';
        console.error(`   [PIPELINE] ❌ Job ${jobId} FAILED: ${errMsg}`);
        progress_1.progressService.update(jobId, 0, 'failed', errMsg);
        throw error;
    }
}
exports.jobProcessor = {
    start() {
        worker = new bullmq_1.Worker('video-processing', processVideoJob, {
            connection: config_1.config.redis,
            concurrency: 1,
        });
        worker.on('completed', (job) => {
            console.log(`✅ [BullMQ] Job ${job.id} completed`);
        });
        worker.on('failed', (job, err) => {
            console.error(`❌ [BullMQ] Job ${job?.id} failed: ${err.message}`);
            if (job) {
                const jobId = job.data.jobId || job.id;
                progress_1.progressService.update(jobId, 0, 'failed', err.message);
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
