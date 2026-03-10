import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { config } from '../config';
import { storageService } from '../services/storage';
import { jobQueue } from '../services/queue';
import { Job } from '../models/job';
import { youtubeDownloader } from '../services/youtubeDownloader';

const router = Router();

// Configure multer with diskStorage for stable large-file uploads
// diskStorage writes directly to disk — never buffers 500MB in memory
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.resolve(config.uploadDir));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.mp4';
        cb(null, `${uuidv4()}${ext}`);
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
 * Returns clean JSON errors instead of crashing on file-too-large etc.
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
 * POST /api/upload
 * Upload a video file and create a new job
 */
router.post('/', upload.single('video'), handleMulterError, async (req: Request, res: Response) => {
    console.log('\n📥 === FILE UPLOAD REQUEST ===');
    console.log('   Time:', new Date().toISOString());
    console.log('   File:', req.file?.originalname || 'No file');
    console.log('   Size:', req.file?.size ? `${(req.file.size / 1024 / 1024).toFixed(2)} MB` : 'N/A');
    console.log('   Type:', req.file?.mimetype || 'N/A');

    try {
        if (!req.file) {
            console.log('   ❌ Error: No video file provided');
            return res.status(400).json({
                success: false,
                message: 'No video file provided',
            });
        }

        // Generate unique job ID
        const jobId = uuidv4();

        // Get file extension
        const fileExtension = path.extname(req.file.originalname).slice(1) || 'mp4';

        // Move file to permanent storage
        const videoPath = storageService.getVideoPath(jobId, fileExtension);
        storageService.moveToStorage(req.file.path, videoPath);

        // Create job
        const job: Job = {
            id: jobId,
            status: 'pending',
            progress: 0,
            videoPath,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Add to queue
        jobQueue.addJob(job);

        console.log(`New job created: ${jobId}`);

        res.json({
            success: true,
            jobId,
            message: 'Video uploaded successfully',
        });
    } catch (error: any) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to upload video',
        });
    }
});

/**
 * POST /api/upload/youtube
 * Download a video from YouTube and create a new job
 */
router.post('/youtube', async (req: Request, res: Response) => {
    console.log('\n📺 === YOUTUBE UPLOAD REQUEST ===');
    console.log('   Time:', new Date().toISOString());
    console.log('   URL:', req.body?.url || 'No URL');

    try {
        const { url } = req.body;

        if (!url) {
            console.log('   ❌ Error: YouTube URL is required');
            return res.status(400).json({
                success: false,
                message: 'YouTube URL is required',
            });
        }

        // Validate URL
        if (!youtubeDownloader.validateYoutubeUrl(url)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid YouTube URL format',
            });
        }

        // Check if yt-dlp is installed
        const isInstalled = await youtubeDownloader.checkInstallation();
        if (!isInstalled) {
            return res.status(500).json({
                success: false,
                message: 'yt-dlp is not installed. Please install it with: pip install yt-dlp',
            });
        }

        // Generate unique job ID
        const jobId = uuidv4();

        console.log(`📺 Processing YouTube video: ${url}`);

        // Get video info first (optional, for logging)
        try {
            const videoInfo = await youtubeDownloader.getVideoInfo(url);
            console.log(`📺 Video: ${videoInfo.title} (${videoInfo.duration}s)`);
        } catch (infoError) {
            console.log('Could not get video info, proceeding with download...');
        }

        // Download video
        const downloadedPath = await youtubeDownloader.downloadVideo(url, jobId);

        // Move to permanent storage location
        const videoPath = storageService.getVideoPath(jobId, 'mp4');
        storageService.moveToStorage(downloadedPath, videoPath);

        // Create job
        const job: Job = {
            id: jobId,
            status: 'pending',
            progress: 0,
            videoPath,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Add to queue
        jobQueue.addJob(job);

        console.log(`✅ YouTube job created: ${jobId}`);

        res.json({
            success: true,
            jobId,
            message: 'YouTube video downloaded and queued for processing',
        });
    } catch (error: any) {
        const errMsg = error.message || 'Failed to download YouTube video';
        console.error('❌ YouTube upload error:', errMsg);

        // Categorize the error for the frontend
        let category = 'download_failed';
        let hint = 'Please try again or use a different video.';

        if (errMsg.includes('Invalid YouTube URL')) {
            category = 'invalid_url';
            hint = 'The URL does not appear to be a valid YouTube link.';
        } else if (errMsg.includes('Private video') || errMsg.includes('Video unavailable')) {
            category = 'video_unavailable';
            hint = 'This video is private or unavailable. Try a public video.';
        } else if (errMsg.includes('Sign in') || errMsg.includes('bot') || errMsg.includes('confirm')) {
            category = 'bot_detected';
            hint = 'YouTube bot detection triggered. Try updating yt-dlp: pip install -U yt-dlp';
        } else if (errMsg.includes('format') || errMsg.includes('Requested format')) {
            category = 'format_error';
            hint = 'Video format issue. Please try a different video.';
        } else if (errMsg.includes('not found') || errMsg.includes('empty')) {
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

export default router;
