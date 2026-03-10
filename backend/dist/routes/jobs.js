"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const queue_1 = require("../services/queue");
const database_1 = require("../services/database");
const router = (0, express_1.Router)();
/**
 * GET /api/jobs/:jobId
 * Get job status and details
 */
router.get('/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = queue_1.jobQueue.getJob(jobId);
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
router.get('/:jobId/clips', (req, res) => {
    const { jobId } = req.params;
    const clipDir = path_1.default.resolve('./storage/clips');
    try {
        // Check if clip directory exists
        if (!fs_1.default.existsSync(clipDir)) {
            return res.json({
                success: true,
                jobId,
                clips: [],
                count: 0
            });
        }
        // Find all clips for this job
        const allFiles = fs_1.default.readdirSync(clipDir);
        const clipFiles = allFiles.filter((file) => file.startsWith(`clip_${jobId}_`) && file.endsWith('.mp4'));
        // Parse clip info
        const clips = clipFiles.map((file, index) => {
            const clipPath = path_1.default.join(clipDir, file);
            const stats = fs_1.default.statSync(clipPath);
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
        }).sort((a, b) => a.clipIndex - b.clipIndex);
        res.json({
            success: true,
            jobId,
            clips,
            count: clips.length
        });
    }
    catch (error) {
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
router.delete('/:jobId/cleanup', async (req, res) => {
    const { jobId } = req.params;
    console.log(`\n🗑️  === CLEANUP REQUEST for job ${jobId} ===`);
    const deletedFiles = [];
    const errors = [];
    const tryDelete = (filePath) => {
        try {
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
                deletedFiles.push(filePath);
            }
        }
        catch (e) {
            errors.push(`${filePath}: ${e.message}`);
        }
    };
    const tryDeleteDir = (dirPath, pattern) => {
        try {
            if (fs_1.default.existsSync(dirPath)) {
                for (const file of fs_1.default.readdirSync(dirPath)) {
                    if (pattern.test(file)) {
                        tryDelete(path_1.default.join(dirPath, file));
                    }
                }
            }
        }
        catch (e) {
            errors.push(`dir ${dirPath}: ${e.message}`);
        }
    };
    try {
        const storageDir = path_1.default.resolve('./storage');
        // 1. Get all clips from DB so we can delete their specific files
        const clips = await database_1.queries.getClipsByJob(jobId);
        for (const clip of clips) {
            if (clip.video_path)
                tryDelete(clip.video_path);
            // Also delete _final variant if it exists
            const ext = path_1.default.extname(clip.video_path);
            const base = clip.video_path.replace(ext, '');
            tryDelete(`${base}_final${ext}`);
            // Delete subtitle style file
            tryDelete(path_1.default.join(storageDir, 'subtitle-styles', `${clip.id}.json`));
        }
        // 2. Delete original video
        tryDelete(path_1.default.join(storageDir, 'videos', `${jobId}.mp4`));
        tryDelete(path_1.default.join(storageDir, 'youtube', `${jobId}.mp4`));
        // 3. Delete audio
        tryDelete(path_1.default.join(storageDir, 'audio', `${jobId}.mp3`));
        // 4. Delete transcript
        tryDelete(path_1.default.join(storageDir, 'transcripts', `${jobId}.json`));
        // 5. Delete any remaining clip files matching this jobId
        tryDeleteDir(path_1.default.join(storageDir, 'clips'), new RegExp(`clip_${jobId}_`));
        tryDeleteDir(path_1.default.join(storageDir, 'final'), new RegExp(jobId));
        // 6. Delete subtitles (pattern: {jobId}_{clipIndex}_{lang}.json)
        tryDeleteDir(path_1.default.join(storageDir, 'subtitles'), new RegExp(`^${jobId}_`));
        // 7. Delete from database
        await database_1.queries.deleteClipsByJob(jobId);
        await database_1.queries.deleteJob(jobId);
        // 8. Remove from in-memory queue
        queue_1.jobQueue.removeJob(jobId);
        console.log(`   Deleted ${deletedFiles.length} files`);
        if (errors.length > 0)
            console.warn(`   ${errors.length} errors:`, errors);
        console.log(`   🗑️  Cleanup complete for ${jobId}\n`);
        res.json({
            success: true,
            jobId,
            deletedFiles: deletedFiles.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    }
    catch (error) {
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
router.get('/', (req, res) => {
    const jobs = queue_1.jobQueue.getAllJobs();
    res.json({
        success: true,
        count: jobs.length,
        jobs,
    });
});
exports.default = router;
