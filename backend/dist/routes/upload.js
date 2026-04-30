"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const config_1 = require("../config");
const storage_1 = require("../services/storage");
const queue_1 = require("../services/queue");
const youtubeDownloader_1 = require("../services/youtubeDownloader");
const rateLimiter_1 = require("../middleware/rateLimiter");
const progress_1 = require("../services/progress");
const router = (0, express_1.Router)();
// Configure multer with diskStorage for stable large-file uploads
// diskStorage writes directly to disk — never buffers 500MB in memory
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path_1.default.resolve(config_1.config.uploadDir));
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname) || '.mp4';
        cb(null, `${(0, uuid_1.v4)()}${ext}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: config_1.config.maxFileSize, // 500MB
    },
    fileFilter: (req, file, cb) => {
        if (config_1.config.allowedVideoTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only video files are allowed.'));
        }
    },
});
/**
 * Multer error handler middleware
 * Returns clean JSON errors instead of crashing on file-too-large etc.
 */
function handleMulterError(err, req, res, next) {
    if (err instanceof multer_1.default.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                message: `File too large. Maximum size is ${config_1.config.maxFileSize / (1024 * 1024)}MB`,
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
 * POST /api/upload
 * Upload a video file and create a new job.
 * No auth required — protected by rate limiting and concurrent job limits.
 */
router.post('/', rateLimiter_1.uploadRateLimit, rateLimiter_1.concurrentJobLimit, upload.single('video'), handleMulterError, async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    console.log('\n📥 === FILE UPLOAD REQUEST ===');
    console.log(`   [PIPELINE] API received upload request from IP: ${ip}`);
    console.log('   Time:', new Date().toISOString());
    console.log('   File:', req.file?.originalname || 'No file');
    console.log('   Size:', req.file?.size ? `${(req.file.size / 1024 / 1024).toFixed(2)} MB` : 'N/A');
    console.log('   Type:', req.file?.mimetype || 'N/A');
    try {
        if (!req.file) {
            console.log('   [PIPELINE] ❌ No video file in request');
            return res.status(400).json({
                success: false,
                message: 'No video file provided',
            });
        }
        // Verify file actually exists on disk
        if (!fs_1.default.existsSync(req.file.path)) {
            console.error('   [PIPELINE] ❌ File not found on disk after multer:', req.file.path);
            return res.status(500).json({
                success: false,
                message: 'Upload failed — file not saved to disk',
            });
        }
        const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(2);
        console.log(`   [PIPELINE] ✅ File received on disk: ${req.file.path} (${fileSizeMB} MB)`);
        // Generate unique job ID
        const jobId = (0, uuid_1.v4)();
        // Get file extension
        const fileExtension = path_1.default.extname(req.file.originalname).slice(1) || 'mp4';
        // Move file to permanent storage
        const videoPath = storage_1.storageService.getVideoPath(jobId, fileExtension);
        storage_1.storageService.moveToStorage(req.file.path, videoPath);
        console.log(`   [PIPELINE] ✅ File moved to storage: ${videoPath}`);
        // Add to BullMQ queue
        await (0, queue_1.addVideoJob)(jobId, videoPath);
        console.log(`   [PIPELINE] ✅ Job added to queue: ${jobId}`);
        // Track for concurrent job limiting
        (0, rateLimiter_1.trackJob)(ip, jobId);
        (0, queue_1.registerJobIp)(jobId, ip);
        console.log(`   [PIPELINE] Upload pipeline complete for job: ${jobId}\n`);
        res.json({
            success: true,
            jobId,
            message: 'Video uploaded successfully',
        });
    }
    catch (error) {
        console.error('   [PIPELINE] ❌ Upload error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to upload video',
        });
    }
});
/**
 * POST /api/upload/youtube
 * Download a video from YouTube and create a new job.
 * No auth required — protected by rate limiting.
 */
router.post('/youtube', rateLimiter_1.uploadRateLimit, rateLimiter_1.concurrentJobLimit, async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    console.log('\n📺 === YOUTUBE UPLOAD REQUEST ===');
    console.log(`   [PIPELINE] API received YouTube request from IP: ${ip}`);
    console.log('   Time:', new Date().toISOString());
    console.log('   URL:', req.body?.url || 'No URL');
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'YouTube URL is required',
            });
        }
        // Validate URL
        if (!youtubeDownloader_1.youtubeDownloader.validateYoutubeUrl(url)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid YouTube URL format',
            });
        }
        // Check if yt-dlp is installed
        const isInstalled = await youtubeDownloader_1.youtubeDownloader.checkInstallation();
        if (!isInstalled) {
            return res.status(500).json({
                success: false,
                message: 'yt-dlp is not installed. Please install it with: pip install yt-dlp',
            });
        }
        // Get video info and check duration
        try {
            const videoInfo = await youtubeDownloader_1.youtubeDownloader.getVideoInfo(url);
            console.log(`   📺 Video: ${videoInfo.title} (${videoInfo.duration}s)`);
            if (videoInfo.duration > config_1.config.maxYoutubeDurationSec) {
                const maxMin = Math.round(config_1.config.maxYoutubeDurationSec / 60);
                const vidMin = Math.round(videoInfo.duration / 60);
                return res.status(400).json({
                    success: false,
                    message: `Video too long (${vidMin} min). Maximum allowed duration is ${maxMin} minutes.`,
                });
            }
        }
        catch (infoError) {
            console.warn('   ⚠️ Could not get video info:', infoError.message);
            // Continue anyway — download will fail if there's a real issue
        }
        // Generate unique job ID FIRST so we can stream progress while we download.
        // Reserving the ID + IP slot before responding lets the frontend open SSE
        // immediately on the next tick — instead of waiting 10–60s for yt-dlp.
        const jobId = (0, uuid_1.v4)();
        (0, rateLimiter_1.trackJob)(ip, jobId);
        (0, queue_1.registerJobIp)(jobId, ip);
        // Seed progress so SSE has something to send on first connect
        progress_1.progressService.update(jobId, 1, 'queued', 'Job created, preparing download...');
        // Reply IMMEDIATELY — the rest happens in the background
        res.json({
            success: true,
            jobId,
            message: 'Job created, downloading in background',
        });
        console.log(`   [PIPELINE] ✅ Responded with jobId ${jobId}, downloading async\n`);
        // Background pipeline: download → move → enqueue. Errors are reported via
        // progressService so the frontend's SSE/poll loop sees a 'failed' stage.
        (async () => {
            try {
                progress_1.progressService.update(jobId, 5, 'downloading', 'Downloading from YouTube...');
                console.log(`   [PIPELINE] Downloading YouTube video: ${url}`);
                const downloadedPath = await youtubeDownloader_1.youtubeDownloader.downloadVideo(url, jobId);
                progress_1.progressService.update(jobId, 8, 'downloading', 'Saving downloaded video...');
                const videoPath = storage_1.storageService.getVideoPath(jobId, 'mp4');
                storage_1.storageService.moveToStorage(downloadedPath, videoPath);
                console.log(`   [PIPELINE] ✅ YouTube video saved: ${videoPath}`);
                progress_1.progressService.update(jobId, 10, 'queued', 'Queued for AI analysis...');
                await (0, queue_1.addVideoJob)(jobId, videoPath);
                console.log(`   [PIPELINE] ✅ YouTube job queued: ${jobId}\n`);
            }
            catch (err) {
                const msg = err?.message || 'YouTube download failed';
                console.error(`   [PIPELINE] ❌ Background YouTube failed for ${jobId}: ${msg}`);
                progress_1.progressService.update(jobId, 0, 'failed', msg);
            }
        })();
        return;
    }
    catch (error) {
        const errMsg = error.message || 'Failed to download YouTube video';
        console.error('   [PIPELINE] ❌ YouTube upload error:', errMsg);
        // Categorize the error for the frontend
        let category = 'download_failed';
        let hint = 'Please try again or use a different video.';
        if (errMsg.includes('Invalid YouTube URL')) {
            category = 'invalid_url';
            hint = 'The URL does not appear to be a valid YouTube link.';
        }
        else if (errMsg.includes('Private video') || errMsg.includes('Video unavailable')) {
            category = 'video_unavailable';
            hint = 'This video is private or unavailable. Try a public video.';
        }
        else if (errMsg.includes('Sign in') || errMsg.includes('bot') || errMsg.includes('confirm')) {
            category = 'bot_detected';
            hint = 'YouTube bot detection triggered. Try updating yt-dlp: pip install -U yt-dlp';
        }
        else if (errMsg.includes('too long') || errMsg.includes('duration')) {
            category = 'too_long';
            hint = `Maximum video duration is ${Math.round(config_1.config.maxYoutubeDurationSec / 60)} minutes.`;
        }
        else if (errMsg.includes('format') || errMsg.includes('Requested format')) {
            category = 'format_error';
            hint = 'Video format issue. Please try a different video.';
        }
        else if (errMsg.includes('not found') || errMsg.includes('empty')) {
            category = 'file_error';
            hint = 'Download completed but output file was not created. Check disk space.';
        }
        res.status(500).json({
            success: false,
            message: hint,
            error: {
                category,
                detail: errMsg.slice(0, 500),
            },
        });
    }
});
exports.default = router;
