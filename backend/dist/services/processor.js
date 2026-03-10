"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobProcessor = void 0;
const axios_1 = __importDefault(require("axios"));
const queue_1 = require("./queue");
const config_1 = require("../config");
/**
 * Job processor — handles background processing of video jobs.
 * Polls the queue every 5 seconds for pending jobs.
 * Processes one job at a time (sequential).
 */
class JobProcessor {
    constructor() {
        this.isProcessing = false;
        this.processingInterval = null;
    }
    /**
     * Start the job processor
     */
    start() {
        console.log('Job processor started');
        this.processingInterval = setInterval(() => {
            this.processNextJob();
        }, 5000);
    }
    /**
     * Stop the job processor
     */
    stop() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        console.log('Job processor stopped');
    }
    /**
     * Process the next pending job.
     * Includes retry logic: if the AI service returns 503 (busy),
     * the job stays in the queue and will be retried next poll.
     */
    async processNextJob() {
        if (this.isProcessing)
            return;
        const pendingJobs = queue_1.jobQueue.getPendingJobs();
        if (pendingJobs.length === 0)
            return;
        const job = pendingJobs[0];
        this.isProcessing = true;
        try {
            console.log(`\n🔄 ====== PROCESSING JOB ${job.id} ======`);
            // STAGE: Transcription
            console.log(`   [STAGE] transcribing — calling AI service...`);
            queue_1.jobQueue.updateJob(job.id, { status: 'processing', progress: 10 });
            const response = await axios_1.default.post(`${config_1.config.aiServiceUrl}/transcribe`, {
                jobId: job.id,
                videoPath: job.videoPath,
            }, {
                timeout: config_1.config.aiRequestTimeoutMs, // 5 minute timeout
                // No maxContentLength/maxBodyLength needed — response is small JSON
            });
            console.log(`   [STAGE] AI response — success=${response.data.success}`);
            if (response.data.success) {
                queue_1.jobQueue.updateJob(job.id, {
                    status: 'completed',
                    progress: 100,
                    audioPath: response.data.audioPath,
                    transcriptPath: response.data.transcriptPath,
                });
                console.log(`   ✅ Job ${job.id} DONE\n`);
            }
            else {
                throw new Error(response.data.error || 'AI service returned unsuccessful response');
            }
        }
        catch (error) {
            // If AI service is busy (503), leave job in queue for retry
            if (error.response?.status === 503 && error.response?.data?.retry) {
                console.log(`   ⏳ AI service busy — will retry job ${job.id} next cycle`);
                queue_1.jobQueue.updateJob(job.id, { status: 'pending' });
            }
            else {
                const errDetail = error.response?.data?.error || error.message || 'Unknown error';
                console.error(`   ❌ Job ${job.id} FAILED — ${errDetail}\n`);
                queue_1.jobQueue.updateJob(job.id, {
                    status: 'failed',
                    error: errDetail,
                });
            }
        }
        finally {
            this.isProcessing = false;
        }
    }
}
exports.jobProcessor = new JobProcessor();
