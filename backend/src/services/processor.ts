import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { jobQueue } from './queue';
import { config } from '../config';

/**
 * Job processor — handles background processing of video jobs.
 * Polls the queue every 5 seconds for pending jobs.
 * Processes one job at a time (sequential).
 */
class JobProcessor {
    private isProcessing = false;
    private processingInterval: NodeJS.Timeout | null = null;

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
    private async processNextJob() {
        if (this.isProcessing) return;

        const pendingJobs = jobQueue.getPendingJobs();
        if (pendingJobs.length === 0) return;

        const job = pendingJobs[0];
        this.isProcessing = true;

        try {
            console.log(`\n🔄 ====== PROCESSING JOB ${job.id} ======`);

            // STAGE: Transcription
            console.log(`   [STAGE] transcribing — calling AI service...`);
            jobQueue.updateJob(job.id, { status: 'processing', progress: 10 });

            const response = await axios.post(
                `${config.aiServiceUrl}/transcribe`,
                {
                    jobId: job.id,
                    videoPath: job.videoPath,
                },
                {
                    timeout: config.aiRequestTimeoutMs, // 5 minute timeout
                    // No maxContentLength/maxBodyLength needed — response is small JSON
                }
            );

            console.log(`   [STAGE] AI response — success=${response.data.success}`);

            if (response.data.success) {
                jobQueue.updateJob(job.id, {
                    status: 'completed',
                    progress: 100,
                    audioPath: response.data.audioPath,
                    transcriptPath: response.data.transcriptPath,
                });
                console.log(`   ✅ Job ${job.id} DONE\n`);
            } else {
                throw new Error(response.data.error || 'AI service returned unsuccessful response');
            }
        } catch (error: any) {
            // If AI service is busy (503), leave job in queue for retry
            if (error.response?.status === 503 && error.response?.data?.retry) {
                console.log(`   ⏳ AI service busy — will retry job ${job.id} next cycle`);
                jobQueue.updateJob(job.id, { status: 'pending' });
            } else {
                const errDetail = error.response?.data?.error || error.message || 'Unknown error';
                console.error(`   ❌ Job ${job.id} FAILED — ${errDetail}\n`);
                jobQueue.updateJob(job.id, {
                    status: 'failed',
                    error: errDetail,
                });
            }
        } finally {
            this.isProcessing = false;
        }
    }
}

export const jobProcessor = new JobProcessor();
