import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { jobQueue } from './queue';
import { storageService } from './storage';
import { config } from '../config';

// #region agent log
const _dbglog = (loc: string, msg: string, data: any = {}, hyp: string = '') => {
    try { fs.appendFileSync(path.resolve(__dirname, '../../..', 'debug-0170bb.log'), JSON.stringify({sessionId:'0170bb',location:loc,message:msg,data,timestamp:Date.now(),hypothesisId:hyp}) + '\n'); } catch {}
};
// #endregion

/**
 * Job processor - handles background processing of video jobs
 * Runs in a loop checking for pending jobs
 */
class JobProcessor {
    private isProcessing = false;
    private processingInterval: NodeJS.Timeout | null = null;

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
    private async processNextJob() {
        // Don't start a new job if already processing one
        if (this.isProcessing) {
            return;
        }

        const pendingJobs = jobQueue.getPendingJobs();
        if (pendingJobs.length === 0) {
            return;
        }

        const job = pendingJobs[0];
        this.isProcessing = true;

        try {
            console.log(`\n🔄 ====== PROCESSING JOB ${job.id} ======`);

            // STAGE: Transcription
            console.log(`   [STAGE] transcribing — calling AI service...`);
            jobQueue.updateJob(job.id, { status: 'processing', progress: 10 });

            const response = await axios.post(`${config.aiServiceUrl}/transcribe`, {
                jobId: job.id,
                videoPath: job.videoPath,
            });

            console.log(`   [STAGE] AI response — success=${response.data.success}`);

            if (response.data.success) {
                jobQueue.updateJob(job.id, {
                    status: 'completed',
                    progress: 100,
                    audioPath: response.data.audioPath,
                    transcriptPath: response.data.transcriptPath,
                });
                console.log(`   [STAGE] completed — transcript: ${response.data.transcriptPath}`);
                console.log(`   ✅ Job ${job.id} DONE\n`);
            } else {
                throw new Error(response.data.error || 'AI service returned unsuccessful response');
            }
        } catch (error: any) {
            const errDetail = error.response?.data?.error || error.message || 'Unknown error';
            console.error(`   [STAGE] FAILED — ${errDetail}`);
            console.error(`   ❌ Job ${job.id} FAILED\n`);
            jobQueue.updateJob(job.id, {
                status: 'failed',
                error: errDetail,
            });
        } finally {
            this.isProcessing = false;
        }
    }
}

export const jobProcessor = new JobProcessor();
