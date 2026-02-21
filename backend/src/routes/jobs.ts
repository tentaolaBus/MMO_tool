import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { jobQueue } from '../services/queue';
import { queries } from '../services/database';

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

        // 1. Get all clips from DB so we can delete their specific files
        const clips = await queries.getClipsByJob(jobId);
        for (const clip of clips) {
            if (clip.video_path) tryDelete(clip.video_path);
            // Also delete _final variant if it exists
            const ext = path.extname(clip.video_path);
            const base = clip.video_path.replace(ext, '');
            tryDelete(`${base}_final${ext}`);
            // Delete subtitle style file
            tryDelete(path.join(storageDir, 'subtitle-styles', `${clip.id}.json`));
        }

        // 2. Delete original video
        tryDelete(path.join(storageDir, 'videos', `${jobId}.mp4`));
        tryDelete(path.join(storageDir, 'youtube', `${jobId}.mp4`));

        // 3. Delete audio
        tryDelete(path.join(storageDir, 'audio', `${jobId}.mp3`));

        // 4. Delete transcript
        tryDelete(path.join(storageDir, 'transcripts', `${jobId}.json`));

        // 5. Delete any remaining clip files matching this jobId
        tryDeleteDir(path.join(storageDir, 'clips'), new RegExp(`clip_${jobId}_`));
        tryDeleteDir(path.join(storageDir, 'final'), new RegExp(jobId));

        // 6. Delete subtitles (pattern: {jobId}_{clipIndex}_{lang}.json)
        tryDeleteDir(path.join(storageDir, 'subtitles'), new RegExp(`^${jobId}_`));

        // 7. Delete from database
        await queries.deleteClipsByJob(jobId);
        await queries.deleteJob(jobId);

        // 8. Remove from in-memory queue
        jobQueue.removeJob(jobId);

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
router.get('/', (req: Request, res: Response) => {
    const jobs = jobQueue.getAllJobs();
    res.json({
        success: true,
        count: jobs.length,
        jobs,
    });
});

export default router;
