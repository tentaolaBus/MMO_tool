import { Router, Request, Response } from 'express';
import fs from 'fs';
import { clipDetector } from '../services/clipDetector';
import { videoCutter } from '../services/videoCutter';
import { jobQueue } from '../services/queue';
import { storageService } from '../services/storage';
import { Transcript } from '../models/job';
import { GeneratedClip } from '../models/clip';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * POST /api/clips/analyze
 * Analyze a transcript and generate clip candidates
 */
router.post('/analyze', async (req: Request, res: Response) => {
    try {
        const { jobId, maxClips = 10 } = req.body;

        if (!jobId) {
            return res.status(400).json({
                success: false,
                message: 'jobId is required'
            });
        }

        // Get job
        const job = jobQueue.getJob(jobId);
        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        // Check if transcript exists
        if (!job.transcriptPath) {
            return res.status(400).json({
                success: false,
                message: 'Transcript not available for this job'
            });
        }

        // Load transcript
        const transcriptData = fs.readFileSync(job.transcriptPath, 'utf-8');
        const transcript: Transcript = JSON.parse(transcriptData);

        // Analyze and generate candidates
        const candidates = clipDetector.analyzeTranscript(transcript, maxClips);

        res.json({
            success: true,
            jobId,
            candidates: candidates.map(c => ({
                startTime: c.startTime,
                endTime: c.endTime,
                duration: c.duration,
                text: c.text,
                score: c.score
            })),
            selectedCount: candidates.length
        });

    } catch (error: any) {
        console.error('Clip analysis error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to analyze clips'
        });
    }
});

/**
 * POST /api/clips/render
 * Render clips from a job
 */
router.post('/render', async (req: Request, res: Response) => {
    try {
        const { jobId, clipIndices, maxClips = 10 } = req.body;

        if (!jobId) {
            return res.status(400).json({
                success: false,
                message: 'jobId is required'
            });
        }

        // Get job
        const job = jobQueue.getJob(jobId);
        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        // Check if video and transcript exist
        if (!job.videoPath || !job.transcriptPath) {
            return res.status(400).json({
                success: false,
                message: 'Video or transcript not available'
            });
        }

        // Load transcript
        const transcriptData = fs.readFileSync(job.transcriptPath, 'utf-8');
        const transcript: Transcript = JSON.parse(transcriptData);

        // Analyze and get candidates
        const candidates = clipDetector.analyzeTranscript(transcript, maxClips);

        if (candidates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No suitable clips found'
            });
        }

        // Determine which clips to render
        let clipsToRender = candidates;
        if (clipIndices && Array.isArray(clipIndices)) {
            clipsToRender = clipIndices
                .filter(idx => idx >= 0 && idx < candidates.length)
                .map(idx => candidates[idx]);
        }

        // Render clips
        const generatedClips: GeneratedClip[] = [];

        for (let i = 0; i < clipsToRender.length; i++) {
            const candidate = clipsToRender[i];

            // Cut clip using FFmpeg
            const clipPath = await videoCutter.cutClip(
                job.videoPath,
                candidate.startTime,
                candidate.endTime,
                jobId,
                i
            );

            const generatedClip: GeneratedClip = {
                id: uuidv4(),
                jobId,
                clipIndex: i,
                videoPath: clipPath,
                startTime: candidate.startTime,
                endTime: candidate.endTime,
                duration: candidate.duration,
                text: candidate.text,
                score: candidate.score,
                createdAt: new Date()
            };

            generatedClips.push(generatedClip);
        }

        res.json({
            success: true,
            jobId,
            clips: generatedClips,
            count: generatedClips.length
        });

    } catch (error: any) {
        console.error('Clip rendering error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to render clips'
        });
    }
});

/**
 * GET /api/clips/:jobId
 * List all clips for a job
 */
router.get('/:jobId', (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;

        // Get clip directory
        const clipDir = videoCutter.getClipStorageDir();

        // Find all clips for this job
        const clipFiles = fs.readdirSync(clipDir)
            .filter(file => file.startsWith(`clip_${jobId}_`))
            .map(file => ({
                filename: file,
                path: `${clipDir}/${file}`
            }));

        res.json({
            success: true,
            jobId,
            clips: clipFiles,
            count: clipFiles.length
        });

    } catch (error: any) {
        console.error('List clips error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to list clips'
        });
    }
});

export default router;
