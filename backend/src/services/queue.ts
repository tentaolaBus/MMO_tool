import { Job } from '../models/job';

/**
 * Simple in-memory job queue
 * For MVP - can be replaced with Redis/BullMQ later
 */
class JobQueue {
    private jobs: Map<string, Job> = new Map();

    /**
     * Add a new job to the queue
     */
    addJob(job: Job): void {
        this.jobs.set(job.id, job);
    }

    /**
     * Get job by ID
     */
    getJob(jobId: string): Job | undefined {
        return this.jobs.get(jobId);
    }

    /**
     * Update job
     */
    updateJob(jobId: string, updates: Partial<Job>): void {
        const job = this.jobs.get(jobId);
        if (job) {
            Object.assign(job, updates, { updatedAt: new Date() });
        }
    }

    /**
     * Get all pending jobs
     */
    getPendingJobs(): Job[] {
        return Array.from(this.jobs.values()).filter(job => job.status === 'pending');
    }

    /**
     * Get all jobs (for debugging)
     */
    getAllJobs(): Job[] {
        return Array.from(this.jobs.values());
    }
}

export const jobQueue = new JobQueue();
