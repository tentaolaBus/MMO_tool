"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobQueue = void 0;
/**
 * Simple in-memory job queue
 * For MVP - can be replaced with Redis/BullMQ later
 */
class JobQueue {
    constructor() {
        this.jobs = new Map();
    }
    /**
     * Add a new job to the queue
     */
    addJob(job) {
        this.jobs.set(job.id, job);
    }
    /**
     * Get job by ID
     */
    getJob(jobId) {
        return this.jobs.get(jobId);
    }
    /**
     * Update job
     */
    updateJob(jobId, updates) {
        const job = this.jobs.get(jobId);
        if (job) {
            Object.assign(job, updates, { updatedAt: new Date() });
        }
    }
    /**
     * Get all pending jobs
     */
    getPendingJobs() {
        return Array.from(this.jobs.values()).filter(job => job.status === 'pending');
    }
    /**
     * Get all jobs (for debugging)
     */
    getAllJobs() {
        return Array.from(this.jobs.values());
    }
}
exports.jobQueue = new JobQueue();
