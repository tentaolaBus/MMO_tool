import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { storageService } from '../services/storage';
import { subtitleRenderer } from '../services/subtitleRenderer';
import { addSubtitleJob, getSubtitleJob } from '../services/subtitleQueue';
import { progressService } from '../services/progress';
import { uploadRateLimit, concurrentJobLimit, trackJob } from '../middleware/rateLimiter';

const router = Router();

// ─── Multer config ──────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.resolve(config.uploadDir)),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.mp4';
        cb(null, `sub_${uuidv4()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: config.maxFileSize },
    fileFilter: (req, file, cb) => {
        if (config.allowedVideoTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only video files are allowed.'));
        }
    },
});

function handleMulterError(err: any, req: Request, res: Response, next: NextFunction) {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                message: `File too large. Max ${config.maxFileSize / (1024 * 1024)}MB`,
            });
        }
        return res.status(400).json({ success: false, message: err.message });
    }
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
}

/**
 * POST /api/subtitles/upload
 * Upload a video and queue it for subtitle generation.
 * Returns jobId immediately — client polls for status.
 * No auth required — protected by rate limiting.
 */
router.post(
    '/upload',
    uploadRateLimit,
    concurrentJobLimit,
    upload.single('video'),
    handleMulterError,
    async (req: Request, res: Response) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';

        console.log('\n📝 === SUBTITLE UPLOAD REQUEST ===');
        console.log(`   [PIPELINE] API received subtitle request from IP: ${ip}`);
        console.log('   Time:', new Date().toISOString());
        console.log('   File:', req.file?.originalname || 'No file');

        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No video file provided' });
            }

            const jobId = uuidv4();
            const fileExt = path.extname(req.file.originalname).slice(1) || 'mp4';
            const videoPath = storageService.getVideoPath(jobId, fileExt);
            storageService.moveToStorage(req.file.path, videoPath);
            console.log(`   [PIPELINE] ✅ File moved to storage: ${videoPath}`);

            // Push to queue (non-blocking)
            await addSubtitleJob(jobId, videoPath);
            console.log(`   [PIPELINE] ✅ Subtitle job queued: ${jobId}`);

            // Track for concurrent job limiting
            trackJob(ip, jobId);

            // Initialize progress
            progressService.update(jobId, 5, 'queued', 'Video queued for subtitle generation...');

            res.json({
                success: true,
                jobId,
                message: 'Video uploaded and queued for subtitle generation',
            });
        } catch (error: any) {
            console.error('   [PIPELINE] ❌ Subtitle upload error:', error.message);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to upload video for subtitles',
            });
        }
    }
);

/**
 * GET /api/subtitles/jobs/:jobId
 * Get subtitle job status and results.
 * Returns segments when job is completed.
 */
router.get('/jobs/:jobId', async (req: Request, res: Response) => {
    const { jobId } = req.params;

    try {
        const job = await getSubtitleJob(jobId);
        const progress = progressService.get(jobId);

        if (!job && !progress) {
            return res.status(404).json({
                success: false,
                message: 'Subtitle job not found',
            });
        }

        const state = job ? await job.getState() : 'unknown';
        const returnvalue = job?.returnvalue;

        // If completed, include subtitle segments in response
        if (state === 'completed' && returnvalue) {
            return res.json({
                success: true,
                jobId,
                status: 'completed',
                progress: progress || { percent: 100, stage: 'completed', message: 'Subtitles ready!' },
                segments: returnvalue.segments || [],
                duration: returnvalue.duration || 0,
                language: returnvalue.language || 'en',
            });
        }

        // If failed, include error
        if (state === 'failed') {
            return res.json({
                success: false,
                jobId,
                status: 'failed',
                progress: progress || { percent: 0, stage: 'failed', message: job?.failedReason || 'Subtitle generation failed' },
                error: job?.failedReason || 'Unknown error',
            });
        }

        // Still processing
        res.json({
            success: true,
            jobId,
            status: state,
            progress: progress || { percent: 0, stage: state, message: 'Processing...' },
        });
    } catch (error: any) {
        console.error('Subtitle status error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get subtitle job status',
        });
    }
});

/**
 * POST /api/subtitles/export
 * Accept video jobId + edited segments + style → burn-in subtitles → download.
 */
router.post('/export', async (req: Request, res: Response) => {
    const { jobId, segments, style, enabled = true } = req.body;

    console.log(`\n📝 === SUBTITLE EXPORT: ${jobId} ===`);

    try {
        if (!jobId || !segments) {
            return res.status(400).json({
                success: false,
                message: 'jobId and segments are required',
            });
        }

        // Find the video
        let videoPath = '';
        for (const ext of ['mp4', 'mpeg', 'mov', 'avi']) {
            const candidate = storageService.getVideoPath(jobId, ext);
            if (fs.existsSync(candidate)) {
                videoPath = candidate;
                break;
            }
        }

        if (!videoPath) {
            return res.status(404).json({
                success: false,
                message: 'Source video not found. Please re-upload.',
            });
        }

        progressService.update(jobId, 20, 'rendering', 'Burning subtitles into video...');

        // Use existing subtitle renderer for burn-in
        const outputPath = await subtitleRenderer.renderWithSubtitles(
            videoPath,
            segments,
            `standalone_${jobId}`,
            style,
            enabled && segments.length > 0
        );

        progressService.update(jobId, 100, 'completed', 'Export complete!');
        setTimeout(() => progressService.remove(jobId), 60000);

        // Send file back
        const stat = fs.statSync(outputPath);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="subtitled_${jobId}.mp4"`);

        const stream = fs.createReadStream(outputPath);
        stream.pipe(res);

    } catch (error: any) {
        console.error('❌ Subtitle export error:', error.message);
        progressService.update(jobId, 0, 'failed', error.message || 'Export failed');
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to export video with subtitles',
        });
    }
});

export default router;
