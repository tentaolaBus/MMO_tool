import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { config } from '../config';
import { storageService } from '../services/storage';
import { jobQueue } from '../services/queue';
import { Job } from '../models/job';

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
    try {
        if (!req.file) {
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

export default router;
