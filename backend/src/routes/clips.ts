import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { clipDetector } from '../services/clipDetector';
import { videoCutter } from '../services/videoCutter';
import { jobQueue } from '../services/queue';
import { queries } from '../services/database';
import { Transcript } from '../models/job';
import { ClipCandidate } from '../models/clip';
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
                message: 'Transcript not available'
            });
        }

        // Load transcript
        const transcriptData = fs.readFileSync(job.transcriptPath, 'utf-8');
        const transcript: Transcript = JSON.parse(transcriptData);

        // Analyze and get candidates
        const analysis = clipDetector.analyzeTranscript(transcript, maxClips);

        res.json({
            success: true,
            jobId,
            candidates: analysis.candidates,
            selectedCount: analysis.selectedCount
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
 * Render clips for a job and save to database
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

        // Check if clips already exist in database
        const existingClips = queries.getClipsByJob.all(jobId);

        if (existingClips.length > 0) {
            console.log(`Found ${existingClips.length} existing clips for job ${jobId} in database`);
            return res.json({
                success: true,
                jobId,
                clips: existingClips.map((c: any) => ({
                    id: c.id,
                    jobId: c.job_id,
                    clipIndex: c.clip_index,
                    videoPath: c.video_path,
                    videoUrl: `/storage/clips/${path.basename(c.video_path)}`,
                    filename: path.basename(c.video_path),
                    startTime: c.start_time,
                    endTime: c.end_time,
                    duration: c.duration,
                    text: c.text,
                    score: {
                        total: c.score_total,
                        durationScore: c.score_duration,
                        keywordScore: c.score_keyword,
                        completenessScore: c.score_completeness,
                        keywords: c.keywords ? JSON.parse(c.keywords) : []
                    },
                    selected: c.selected === 1,
                    createdAt: c.created_at
                })),
                count: existingClips.length,
                message: 'Clips loaded from database (already rendered)'
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
        const analysis = clipDetector.analyzeTranscript(transcript, maxClips);
        const candidates = analysis.candidates;

        if (candidates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No suitable clips found'
            });
        }

        // Determine which clips to render
        let clipsToRender: ClipCandidate[] = candidates;
        if (clipIndices && Array.isArray(clipIndices)) {
            clipsToRender = clipIndices
                .filter(idx => idx >= 0 && idx < candidates.length)
                .map(idx => candidates[idx]);
        }

        // Render clips and save to database
        const generatedClips: any[] = [];

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

            const clipId = uuidv4();

            // Save to database
            queries.insertClip.run(
                clipId,
                jobId,
                i,                                          // clip_index
                clipPath,                                   // video_path
                candidate.startTime,                        // start_time
                candidate.endTime,                          // end_time
                candidate.duration,                         // duration
                candidate.text,                             // text
                candidate.score.total,                      // score_total
                candidate.score.durationScore,              // score_duration
                candidate.score.keywordScore,               // score_keyword
                candidate.score.completenessScore,          // score_completeness
                JSON.stringify(candidate.score.keywords),   // keywords (JSON)
                0,                                          // selected (false)
                1                                           // rendered (true)
            );

            generatedClips.push({
                id: clipId,
                jobId,
                clipIndex: i,
                videoPath: clipPath,
                videoUrl: `/storage/clips/${path.basename(clipPath)}`,
                filename: path.basename(clipPath),
                startTime: candidate.startTime,
                endTime: candidate.endTime,
                duration: candidate.duration,
                text: candidate.text,
                score: candidate.score,
                selected: false,
                createdAt: new Date().toISOString()
            });
        }

        console.log(`Rendered and saved ${generatedClips.length} clips for job ${jobId} to database`);

        res.json({
            success: true,
            jobId,
            clips: generatedClips,
            count: generatedClips.length,
            message: 'Clips rendered and saved to database'
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
 * Get all clips for a job from database
 */
router.get('/:jobId', async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;

        const clips = queries.getClipsByJob.all(jobId);

        // Format clips for frontend
        const formattedClips = clips.map((c: any) => ({
            id: c.id,
            jobId: c.job_id,
            clipIndex: c.clip_index,
            videoPath: c.video_path,
            videoUrl: `/storage/clips/${path.basename(c.video_path)}`,
            filename: path.basename(c.video_path),
            startTime: c.start_time,
            endTime: c.end_time,
            duration: c.duration,
            text: c.text,
            score: {
                total: c.score_total,
                durationScore: c.score_duration,
                keywordScore: c.score_keyword,
                completenessScore: c.score_completeness,
                keywords: c.keywords ? JSON.parse(c.keywords) : []
            },
            selected: c.selected === 1,
            createdAt: c.created_at
        }));

        res.json({
            success: true,
            jobId,
            clips: formattedClips,
            count: formattedClips.length
        });

    } catch (error: any) {
        console.error('Get clips error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get clips'
        });
    }
});

/**
 * PUT /api/clips/:clipId/select
 * Update clip selection state
 */
router.put('/:clipId/select', async (req: Request, res: Response) => {
    try {
        const { clipId } = req.params;
        const { selected } = req.body;

        if (typeof selected !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'selected must be a boolean'
            });
        }

        const result = queries.updateClipSelection.run(selected ? 1 : 0, clipId);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Clip not found'
            });
        }

        res.json({
            success: true,
            clipId,
            selected
        });

    } catch (error: any) {
        console.error('Update clip selection error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update clip selection'
        });
    }
});

/**
 * GET /api/clips/:jobId/selected
 * Get selected clips for a job
 */
router.get('/:jobId/selected', async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;

        const selectedClips = queries.getSelectedClips.all(jobId);

        // Format clips
        const formattedClips = selectedClips.map((c: any) => ({
            id: c.id,
            jobId: c.job_id,
            clipIndex: c.clip_index,
            videoUrl: `/storage/clips/${path.basename(c.video_path)}`,
            startTime: c.start_time,
            endTime: c.end_time,
            duration: c.duration,
            text: c.text
        }));

        res.json({
            success: true,
            jobId,
            clips: formattedClips,
            count: formattedClips.length
        });

    } catch (error: any) {
        console.error('Get selected clips error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get selected clips'
        });
    }
});

/**
 * POST /api/clips/:clipId/render-final
 * Render final video with burned-in subtitles
 */
router.post('/:clipId/render-final', async (req: Request, res: Response) => {
    const { clipId } = req.params;
    const { language = 'en', useEditedSubtitles = true } = req.body;

    try {
        // Parse clipId
        const clipIdMatch = clipId.match(/^(?:clip_)?(.+?)_(\d+)(?:\.mp4)?$/);
        if (!clipIdMatch) {
            return res.status(400).json({
                success: false,
                message: 'Invalid clip ID format',
            });
        }

        const [, jobId, clipIndexStr] = clipIdMatch;
        const clipIndex = parseInt(clipIndexStr);

        // Find clip file
        const clipsDir = videoCutter.getClipStorageDir();
        const clipFilename = `clip_${jobId}_${clipIndex}.mp4`;
        const clipPath = path.join(clipsDir, clipFilename);

        if (!fs.existsSync(clipPath)) {
            return res.status(404).json({
                success: false,
                message: 'Clip file not found',
            });
        }

        // Load subtitles (edited or original)
        const subtitlesDir = path.resolve('./storage/subtitles');
        let subtitlesFile: string;

        if (useEditedSubtitles) {
            subtitlesFile = path.join(subtitlesDir, `${clipId}_${language}_edited.json`);
            if (!fs.existsSync(subtitlesFile)) {
                // Fall back to original if edited not found
                subtitlesFile = path.join(subtitlesDir, `${clipId}_${language}.json`);
            }
        } else {
            subtitlesFile = path.join(subtitlesDir, `${clipId}_${language}.json`);
        }

        if (!fs.existsSync(subtitlesFile)) {
            return res.status(404).json({
                success: false,
                message: 'Subtitles not found. Please generate subtitles first.',
            });
        }

        const subtitlesData = JSON.parse(fs.readFileSync(subtitlesFile, 'utf-8'));
        const segments = subtitlesData.segments;

        // Render final video
        const { subtitleRenderer } = require('../services/subtitleRenderer');
        const startTime = Date.now();

        const finalVideoPath = await subtitleRenderer.renderWithSubtitles(
            clipPath,
            segments,
            clipId
        );

        const renderTime = ((Date.now() - startTime) / 1000).toFixed(1);

        // Generate URL for final video
        const filename = path.basename(finalVideoPath);
        const finalVideoUrl = `/storage/final/${filename}`;

        res.json({
            success: true,
            clipId,
            finalVideoUrl,
            finalVideoPath,
            renderTime: parseFloat(renderTime),
            language,
            subtitleCount: segments.length,
        });

    } catch (error: any) {
        console.error('Error rendering final video:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to render final video',
        });
    }
});

export default router;
