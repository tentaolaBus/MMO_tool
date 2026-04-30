import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { storageService } from '../services/storage';
import { videoReframer } from '../services/videoReframer';
import { addReframeJob, getReframeJob } from '../services/reframeQueue';
import { progressService } from '../services/progress';
import { uploadRateLimit, concurrentJobLimit, trackJob } from '../middleware/rateLimiter';
import { queries } from '../services/database';

const router = Router();

// Multer config for reframe uploads (same storage pattern as main upload)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.resolve(config.uploadDir));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.mp4';
        cb(null, `reframe_${uuidv4()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: config.maxFileSize, // 500MB
    },
    fileFilter: (req, file, cb) => {
        if (config.allowedVideoTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only video files are allowed.'));
        }
    },
});

/**
 * Multer error handler middleware
 */
function handleMulterError(err: any, req: Request, res: Response, next: NextFunction) {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                message: `File too large. Maximum size is ${config.maxFileSize / (1024 * 1024)}MB`,
            });
        }
        return res.status(400).json({
            success: false,
            message: `Upload error: ${err.message}`,
        });
    }
    if (err) {
        return res.status(400).json({
            success: false,
            message: err.message || 'Upload failed',
        });
    }
    next();
}

/**
 * POST /api/reframe/upload
 * Upload a video and create a reframe job.
 * No auth required — protected by rate limiting.
 *
 * Body fields (via multipart form):
 *   - video: File
 *   - ratio: '9:16' | '1:1' | '4:5' (default: '9:16')
 *   - cropX: number 0–1 (default: 0.5)
 *   - autoCenter: 'true' | 'false' (default: 'true')
 */
router.post(
    '/upload',
    uploadRateLimit,
    concurrentJobLimit,
    upload.single('video'),
    handleMulterError,
    async (req: Request, res: Response) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';

        console.log('\n📐 === REFRAME UPLOAD REQUEST ===');
        console.log(`   [PIPELINE] API received reframe request from IP: ${ip}`);
        console.log('   Time:', new Date().toISOString());
        console.log('   File:', req.file?.originalname || 'No file');
        console.log('   Size:', req.file?.size ? `${(req.file.size / 1024 / 1024).toFixed(2)} MB` : 'N/A');

        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No video file provided',
                });
            }

            // Parse settings from form body
            const ratio = (['9:16', '1:1', '4:5'].includes(req.body.ratio))
                ? req.body.ratio
                : '9:16';
            const cropX = parseFloat(req.body.cropX) || 0.5;
            const autoCenter = req.body.autoCenter !== 'false';

            const settings = { ratio, cropX, autoCenter };
            console.log('   Settings:', JSON.stringify(settings));

            // Generate job ID
            const jobId = uuidv4();

            // Move to permanent storage
            const fileExtension = path.extname(req.file.originalname).slice(1) || 'mp4';
            const videoPath = storageService.getVideoPath(jobId, fileExtension);
            storageService.moveToStorage(req.file.path, videoPath);
            console.log(`   [PIPELINE] ✅ File moved to storage: ${videoPath}`);

            // Probe video to return metadata immediately
            let meta = null;
            try {
                meta = await videoReframer.probeVideo(videoPath);
                console.log(`   [PIPELINE] Video dimensions: ${meta.width}×${meta.height}`);

                // Quick validation
                const validation = videoReframer.validateForReframe(meta);
                if (!validation.valid) {
                    // Clean up the file
                    storageService.deleteFile(videoPath);
                    return res.status(422).json({
                        success: false,
                        message: validation.reason,
                    });
                }
            } catch (probeError: any) {
                console.warn('   ⚠️ Could not probe video:', probeError.message);
            }

            // Add to reframe queue
            // Legacy upload-based reframe flow: treat jobId as clipId.
            // The AI pipeline reads from /storage/videos/<jobId>.mp4 and outputs /storage/reframed/reframed_<jobId>.mp4
            await addReframeJob(jobId, {
                clipId: jobId,
                videoUrl: `/storage/videos/${jobId}.mp4`,
                targetAspectRatio: settings.ratio || '9:16',
            });
            console.log(`   [PIPELINE] ✅ Reframe job queued: ${jobId}`);

            // Track for concurrent job limiting
            trackJob(ip, jobId);

            res.json({
                success: true,
                jobId,
                message: 'Video uploaded and queued for reframing',
                meta,
            });
        } catch (error: any) {
            console.error('   [PIPELINE] ❌ Reframe upload error:', error.message);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to upload video for reframing',
            });
        }
    }
);

/**
 * POST /api/reframe
 * Production reframing request for an EXISTING clip (Opus-like).
 *
 * Body (JSON):
 *   - clipId: string
 *   - videoUrl: string  (usually `/storage/clips/<file>.mp4` from the clips API)
 *   - targetAspectRatio: '9:16' (future-proof)
 *
 * Returns immediately with BullMQ jobId. Track progress via /api/jobs/:jobId/progress (SSE).
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const { clipId, videoUrl, targetAspectRatio = '9:16' } = req.body || {};

        if (!clipId || typeof clipId !== 'string') {
            return res.status(400).json({ success: false, message: 'clipId is required' });
        }
        if (!videoUrl || typeof videoUrl !== 'string') {
            return res.status(400).json({ success: false, message: 'videoUrl is required' });
        }
        if (typeof targetAspectRatio !== 'string') {
            return res.status(400).json({ success: false, message: 'targetAspectRatio must be a string' });
        }

        // Sanity: ensure clip exists (helps frontends catch stale IDs early)
        try {
            const clip = await queries.getClipById(clipId);
            if (!clip) {
                return res.status(404).json({ success: false, message: 'Clip not found' });
            }
        } catch {
            // If DB is down, still allow enqueue (worker will fail loudly).
        }

        const jobId = uuidv4();

        // Seed progress immediately so SSE updates move off "idle" right away.
        progressService.update(jobId, 1, 'queued', 'Queued for AI reframing...');

        await addReframeJob(jobId, { clipId, videoUrl, targetAspectRatio });

        return res.json({ success: true, jobId });
    } catch (error: any) {
        console.error('❌ POST /api/reframe error:', error.message);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to queue reframe job',
        });
    }
});

/**
 * POST /api/reframe/settings
 * Update reframe settings for an existing job and re-queue.
 * Useful when user adjusts crop position after initial upload.
 */
router.post('/settings/:jobId', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const { ratio, cropX, autoCenter } = req.body;

    console.log(`\n📐 === REFRAME SETTINGS UPDATE: ${jobId} ===`);

    try {
        // Find the original video path
        const videoPath = storageService.getVideoPath(jobId, 'mp4');
        if (!fs.existsSync(videoPath)) {
            return res.status(404).json({
                success: false,
                message: 'Original video not found. Please re-upload.',
            });
        }

        // Clean up previous reframed output if exists
        videoReframer.cleanup(jobId);

        const settings = {
            ratio: (['9:16', '1:1', '4:5'].includes(ratio)) ? ratio : '9:16',
            cropX: parseFloat(cropX) || 0.5,
            autoCenter: autoCenter !== false,
        };

        // Re-queue with new settings
        await addReframeJob(`${jobId}-r${Date.now()}`, {
            clipId: jobId,
            videoUrl: `/storage/videos/${jobId}.mp4`,
            targetAspectRatio: settings.ratio || '9:16',
        });

        res.json({
            success: true,
            message: 'Reframe settings updated and re-queued',
        });
    } catch (error: any) {
        console.error('❌ Settings update error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update settings',
        });
    }
});

/**
 * GET /api/reframe/jobs/:jobId
 * Get reframe job status.
 */
router.get('/jobs/:jobId', async (req: Request, res: Response) => {
    const { jobId } = req.params;

    try {
        const job = await getReframeJob(jobId);
        const progress = progressService.get(jobId);

        if (!job && !progress) {
            return res.status(404).json({
                success: false,
                message: 'Reframe job not found',
            });
        }

        const state = job ? await job.getState() : 'unknown';
        const outputPath = videoReframer.getOutputPath(jobId);
        const hasOutput = fs.existsSync(outputPath);

        res.json({
            success: true,
            jobId,
            status: state,
            progress: progress || { percent: 0, stage: 'unknown', message: '' },
            hasOutput,
            returnvalue: job?.returnvalue || null,
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get job status',
        });
    }
});

/**
 * GET /api/reframe/jobs/:jobId/download
 * Download the reframed video.
 */
router.get('/jobs/:jobId/download', async (req: Request, res: Response) => {
    const { jobId } = req.params;

    try {
        const outputPath = videoReframer.getOutputPath(jobId);

        if (!fs.existsSync(outputPath)) {
            return res.status(404).json({
                success: false,
                message: 'Reframed video not found. It may still be processing.',
            });
        }

        const stat = fs.statSync(outputPath);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="reframed_${jobId}.mp4"`);

        const stream = fs.createReadStream(outputPath);
        stream.pipe(res);
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to download reframed video',
        });
    }
});

/**
 * DELETE /api/reframe/jobs/:jobId/cleanup
 * Clean up all files for a reframe job (source + output).
 */
router.delete('/jobs/:jobId/cleanup', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    console.log(`\n🗑️  === REFRAME CLEANUP: ${jobId} ===`);

    const deletedFiles: string[] = [];
    const errors: string[] = [];

    const tryDelete = (filePath: string) => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                deletedFiles.push(filePath);
                console.log(`   🗑️  Deleted: ${path.basename(filePath)}`);
            }
        } catch (e: any) {
            errors.push(`${filePath}: ${e.message}`);
        }
    };

    // Delete source video (try common extensions)
    for (const ext of ['mp4', 'mpeg', 'mov', 'avi']) {
        tryDelete(storageService.getVideoPath(jobId, ext));
    }

    // Delete reframed output
    tryDelete(videoReframer.getOutputPath(jobId));

    // Remove from queue
    try {
        const job = await getReframeJob(jobId);
        if (job) await job.remove();
    } catch {}

    progressService.remove(jobId);

    console.log(`   ✅ Reframe cleanup done: ${deletedFiles.length} files deleted\n`);

    res.json({
        success: true,
        jobId,
        deletedFiles: deletedFiles.length,
        errors: errors.length > 0 ? errors : undefined,
    });
});

/**
 * GET /api/reframe/jobs/:jobId/probe
 * Probe the uploaded video to get metadata (dimensions, duration).
 * Used by the frontend for the crop preview before processing.
 */
router.get('/jobs/:jobId/probe', async (req: Request, res: Response) => {
    const { jobId } = req.params;

    try {
        // Try common extensions
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
                message: 'Video file not found',
            });
        }

        const meta = await videoReframer.probeVideo(videoPath);

        res.json({
            success: true,
            meta,
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to probe video',
        });
    }
});

export default router;
