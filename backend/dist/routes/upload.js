"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const storage_1 = require("../services/storage");
const queue_1 = require("../services/queue");
const youtubeDownloader_1 = require("../services/youtubeDownloader");
const router = (0, express_1.Router)();
// Configure multer for file upload
const upload = (0, multer_1.default)({
    dest: config_1.config.uploadDir,
    limits: {
        fileSize: config_1.config.maxFileSize,
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
 * POST /api/upload
 * Upload a video file and create a new job
 */
router.post('/', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No video file provided',
            });
        }
        // Generate unique job ID
        const jobId = (0, uuid_1.v4)();
        // Get file extension
        const fileExtension = path_1.default.extname(req.file.originalname).slice(1) || 'mp4';
        // Move file to permanent storage
        const videoPath = storage_1.storageService.getVideoPath(jobId, fileExtension);
        storage_1.storageService.moveToStorage(req.file.path, videoPath);
        // Create job
        const job = {
            id: jobId,
            status: 'pending',
            progress: 0,
            videoPath,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        // Add to queue
        queue_1.jobQueue.addJob(job);
        console.log(`New job created: ${jobId}`);
        res.json({
            success: true,
            jobId,
            message: 'Video uploaded successfully',
        });
    }
    catch (error) {
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
router.post('/youtube', async (req, res) => {
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
        // Generate unique job ID
        const jobId = (0, uuid_1.v4)();
        console.log(`📺 Processing YouTube video: ${url}`);
        // Get video info first (optional, for logging)
        try {
            const videoInfo = await youtubeDownloader_1.youtubeDownloader.getVideoInfo(url);
            console.log(`📺 Video: ${videoInfo.title} (${videoInfo.duration}s)`);
        }
        catch (infoError) {
            console.log('Could not get video info, proceeding with download...');
        }
        // Download video
        const downloadedPath = await youtubeDownloader_1.youtubeDownloader.downloadVideo(url, jobId);
        // Move to permanent storage location
        const videoPath = storage_1.storageService.getVideoPath(jobId, 'mp4');
        storage_1.storageService.moveToStorage(downloadedPath, videoPath);
        // Create job
        const job = {
            id: jobId,
            status: 'pending',
            progress: 0,
            videoPath,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        // Add to queue
        queue_1.jobQueue.addJob(job);
        console.log(`✅ YouTube job created: ${jobId}`);
        res.json({
            success: true,
            jobId,
            message: 'YouTube video downloaded and queued for processing',
        });
    }
    catch (error) {
        console.error('YouTube upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to download YouTube video',
        });
    }
});
exports.default = router;
