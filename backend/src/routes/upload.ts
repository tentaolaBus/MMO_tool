import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { config } from '../config';
import { storageService } from '../services/storage';
import { jobQueue } from '../services/queue';
import { Job } from '../models/job';
import { youtubeDownloader } from '../services/youtubeDownloader';

const router = Router();

// Configure multer for file upload
const upload = multer({
    dest: config.uploadDir,
    limits: {
        fileSize: config.maxFileSize,
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
 * POST /api/upload
 * Upload a video file and create a new job
 */
router.post('/', upload.single('video'), async (req: Request, res: Response) => {
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
        console.error('YouTube upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to download YouTube video',
        });
    }
});

export default router;

