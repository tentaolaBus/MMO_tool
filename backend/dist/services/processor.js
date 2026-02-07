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
 * Job processor - handles background processing of video jobs
 * Runs in a loop checking for pending jobs
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
        // Check for new jobs every 5 seconds
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
     * Process the next pending job
     */
    async processNextJob() {
        // Don't start a new job if already processing one
        if (this.isProcessing) {
            return;
        }
        const pendingJobs = queue_1.jobQueue.getPendingJobs();
        if (pendingJobs.length === 0) {
            return;
        }
        const job = pendingJobs[0];
        this.isProcessing = true;
        try {
            console.log(`Processing job ${job.id}`);
            // Update job status to processing
            queue_1.jobQueue.updateJob(job.id, { status: 'processing', progress: 10 });
            // Call AI service to transcribe
            const response = await axios_1.default.post(`${config_1.config.aiServiceUrl}/transcribe`, {
                jobId: job.id,
                videoPath: job.videoPath,
            });
            if (response.data.success) {
                // Update job with results
                queue_1.jobQueue.updateJob(job.id, {
                    status: 'completed',
                    progress: 100,
                    audioPath: response.data.audioPath,
                    transcriptPath: response.data.transcriptPath,
                });
                console.log(`Job ${job.id} completed successfully`);
            }
            else {
                throw new Error('AI service returned unsuccessful response');
            }
        }
        catch (error) {
            console.error(`Job ${job.id} failed:`, error.message);
            queue_1.jobQueue.updateJob(job.id, {
                status: 'failed',
                error: error.message || 'Unknown error occurred',
            });
        }
        finally {
            this.isProcessing = false;
        }
    }
}
exports.jobProcessor = new JobProcessor();
