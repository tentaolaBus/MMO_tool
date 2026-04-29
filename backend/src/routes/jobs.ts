import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getVideoJob, getAllVideoJobs, removeJob, readJobProgress } from '../services/queue';
import { queries } from '../services/database';

const router = Router();

/**
 * GET /api/jobs/:jobId
 * Get job status and details
 */
router.get('/:jobId', async (req: Request, res: Response) => {
    const { jobId } = req.params;

    const job = await getVideoJob(jobId);

    if (!job) {
        return res.status(404).json({
            success: false,
            message: 'Job not found',
        });
    }

    const state = await job.getState();
    // Normalize progress so `progress` is always a number (legacy contract)
    // and the rich shape is exposed as `progressDetail`.
    const progress = readJobProgress(job.progress);

    res.json({
        id: job.id,
        status: state === 'waiting' ? 'pending' : state,
        progress: progress.percent,
        progressDetail: progress,
        videoPath: job.data.videoPath,
        result: job.returnvalue,
        error: job.failedReason,
        createdAt: new Date(job.timestamp),
        updatedAt: new Date(job.processedOn || job.timestamp),
    });
});

/**
 * GET /api/jobs/:jobId/clips
 * Get all generated clips for a job
 */
router.get('/:jobId/clips', (req: Request, res: Response) => {
    const { jobId } = req.params;

    const clipDir = path.resolve('./storage/clips');

    try {
        if (!fs.existsSync(clipDir)) {
            return res.json({
                success: true,
                jobId,
                clips: [],
                count: 0
            });
        }

        const allFiles = fs.readdirSync(clipDir);
        const clipFiles = allFiles.filter((file: string) =>
            file.startsWith(`clip_${jobId}_`) && file.endsWith('.mp4')
        );

        const clips = clipFiles.map((file: string, index: number) => {
            const clipPath = path.join(clipDir, file);
            const stats = fs.statSync(clipPath);

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
 * DELETE /api/jobs/:jobId/cleanup
 * Delete all files and database records for a job (original video, clips, audio, etc.)
 */
router.delete('/:jobId/cleanup', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    console.log(`\n🗑️  === CLEANUP REQUEST for job ${jobId} ===`);

    const deletedFiles: string[] = [];
    const errors: string[] = [];

    const tryDelete = (filePath: string) => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                deletedFiles.push(filePath);
            }
        } catch (e: any) {
            errors.push(`${filePath}: ${e.message}`);
        }
    };

    const tryDeleteDir = (dirPath: string, pattern: RegExp) => {
        try {
            if (fs.existsSync(dirPath)) {
                for (const file of fs.readdirSync(dirPath)) {
                    if (pattern.test(file)) {
                        tryDelete(path.join(dirPath, file));
                    }
                }
            }
        } catch (e: any) {
            errors.push(`dir ${dirPath}: ${e.message}`);
        }
    };

    try {
        const storageDir = path.resolve('./storage');

        const clips = await queries.getClipsByJob(jobId);
        for (const clip of clips) {
            if (clip.video_path) tryDelete(clip.video_path);
            const ext = path.extname(clip.video_path);
            const base = clip.video_path.replace(ext, '');
            tryDelete(`${base}_final${ext}`);
            tryDelete(path.join(storageDir, 'subtitle-styles', `${clip.id}.json`));
        }

        tryDelete(path.join(storageDir, 'videos', `${jobId}.mp4`));
        tryDelete(path.join(storageDir, 'youtube', `${jobId}.mp4`));
        tryDelete(path.join(storageDir, 'audio', `${jobId}.mp3`));
        tryDelete(path.join(storageDir, 'transcripts', `${jobId}.json`));

        tryDeleteDir(path.join(storageDir, 'clips'), new RegExp(`clip_${jobId}_`));
        tryDeleteDir(path.join(storageDir, 'final'), new RegExp(jobId));
        tryDeleteDir(path.join(storageDir, 'subtitles'), new RegExp(`^${jobId}_`));

        await queries.deleteClipsByJob(jobId);
        await queries.deleteJob(jobId);

        // Remove from BullMQ queue and release concurrent slot
        await removeJob(jobId);

        console.log(`   Deleted ${deletedFiles.length} files`);
        if (errors.length > 0) console.warn(`   ${errors.length} errors:`, errors);
        console.log(`   🗑️  Cleanup complete for ${jobId}\n`);

        res.json({
            success: true,
            jobId,
            deletedFiles: deletedFiles.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error: any) {
        console.error('Cleanup error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Cleanup failed',
        });
    }
});

/**
 * GET /api/jobs
 * Get all jobs (for debugging)
 */
router.get('/', async (req: Request, res: Response) => {
    const jobs = await getAllVideoJobs();
    const allJobs = [
        ...jobs.waiting,
        ...jobs.active,
        ...jobs.completed,
        ...jobs.failed,
    ];
    res.json({
        success: true,
        count: allJobs.length,
        jobs: allJobs.map(j => ({
            id: j.id,
            status: j.finishedOn ? (j.failedReason ? 'failed' : 'completed') : 'pending',
            data: j.data,
        })),
    });
});

export default router;
