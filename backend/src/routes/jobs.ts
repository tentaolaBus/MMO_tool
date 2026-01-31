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
 * GET /api/jobs/:jobId/clips
 * Get all generated clips for a job
 */
router.get('/:jobId/clips', (req: Request, res: Response) => {
    const { jobId } = req.params;
    const fs = require('fs');
    const path = require('path');

    const clipDir = path.resolve('./storage/clips');

    try {
        // Check if clip directory exists
        if (!fs.existsSync(clipDir)) {
            return res.json({
                success: true,
                jobId,
                clips: [],
                count: 0
            });
        }

        // Find all clips for this job
        const allFiles = fs.readdirSync(clipDir);
        const clipFiles = allFiles.filter((file: string) =>
            file.startsWith(`clip_${jobId}_`) && file.endsWith('.mp4')
        );

        // Parse clip info
        const clips = clipFiles.map((file: string, index: number) => {
            const clipPath = path.join(clipDir, file);
            const stats = fs.statSync(clipPath);

            // Extract clip index from filename
            const match = file.match(/clip_.*_(\d+)\.mp4$/);
            const clipIndex = match ? parseInt(match[1]) : index;

            return {
                id: `${jobId}_${clipIndex}`,
                jobId,
                clipIndex,
                videoUrl: `/storage/clips/${file}`,
                filename: file,
                size: stats.size,
                createdAt: stats.birthtime
            };
        }).sort((a: any, b: any) => a.clipIndex - b.clipIndex);

        res.json({
            success: true,
            jobId,
            clips,
            count: clips.length
        });

    } catch (error: any) {
        console.error('Error listing clips:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to list clips'
        });
    }
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
