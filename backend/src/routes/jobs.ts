import { Router, Request, Response } from 'express';
import { jobQueue } from '../services/queue';

const router = Router();

/**
 * GET /api/jobs/:jobId
 * Get job status and details
 */
router.get('/:jobId', (req: Request, res: Response) => {
    const { jobId } = req.params;

    const job = jobQueue.getJob(jobId);

    if (!job) {
        return res.status(404).json({
            success: false,
            message: 'Job not found',
        });
    }

    res.json(job);
});

/**
 * GET /api/jobs
 * Get all jobs (for debugging)
 */
router.get('/', (req: Request, res: Response) => {
    const jobs = jobQueue.getAllJobs();
    res.json({
        success: true,
        count: jobs.length,
        jobs,
    });
});

export default router;
