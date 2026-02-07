import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { clipDetector } from '../services/clipDetector';
import { videoCutter } from '../services/videoCutter';
import { jobQueue } from '../services/queue';
import { queries } from '../services/database';
import { Transcript } from '../models/job';
import { ClipCandidate, ClipAnalysisResult } from '../models/clip';
import { v4 as uuidv4 } from 'uuid';
import { cloudinaryService } from '../services/cloudinaryService';

const router = Router();

// Type for clip database row
interface ClipRow {
    id: string;
    job_id: string;
    clip_index: number;
    video_path: string;
    cloudinary_public_id: string | null;
    cloudinary_url: string | null;
    start_time: number;
    end_time: number;
    duration: number;
    text: string;
    score_total: number;
    score_duration: number;
    score_keyword: number;
    score_completeness: number;
    keywords: string;
    selected: number;
    rendered: number;
    created_at: string;
    updated_at: string;
}

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
    const startTime = Date.now();
    console.log('\n🎬 === POST /clips/render ===');

    try {
        const { jobId, maxClips = 10, clipIndices } = req.body;

        // ===== VALIDATION =====
        console.log(`📋 Request: jobId=${jobId}, maxClips=${maxClips}`);

        if (!jobId || typeof jobId !== 'string') {
            console.error('❌ Validation error: Missing or invalid jobId');
            return res.status(400).json({
                success: false,
                message: 'Missing or invalid jobId parameter'
            });
        }

        if (typeof maxClips !== 'number' || maxClips < 1 || maxClips > 50) {
            console.error(`❌ Validation error: Invalid maxClips value: ${maxClips}`);
            return res.status(400).json({
                success: false,
                message: 'maxClips must be a number between 1 and 50'
            });
        }

        // ===== CHECK DATABASE FIRST =====
        console.log('🔍 Checking if clips already exist in database...');
        try {
            const existingClips = queries.getClipsByJob.all(jobId);

            if (existingClips && existingClips.length > 0) {
                console.log(`✅ Found ${existingClips.length} existing clips in database`);
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
        } catch (dbError: any) {
            console.error('❌ Database query error:', dbError.message);
            return res.status(500).json({
                success: false,
                message: 'Database error while checking for existing clips',
                error: dbError.message
            });
        }

        console.log('📝 No existing clips found, starting render...');

        // ===== GET JOB =====
        const job = jobQueue.getJob(jobId);
        if (!job) {
            console.error(`❌ Job not found: ${jobId}`);
            return res.status(404).json({
                success: false,
                message: `Job not found: ${jobId}`
            });
        }

        console.log(`✅ Job found: ${job.id}, status: ${job.status}`);

        // ===== ENSURE JOB EXISTS IN DATABASE =====
        console.log('💾 Ensuring job exists in database...');
        try {
            // Check if job exists in database
            const existingJob = queries.getJob.get(jobId);

            if (!existingJob) {
                // Insert job into database
                console.log('  📝 Job not in database, inserting...');
                queries.insertJob.run(
                    job.id,
                    job.status,
                    job.progress || 0,
                    job.videoPath || '',
                    job.audioPath || null,
                    job.transcriptPath || null
                );
                console.log('  ✅ Job inserted into database');
            } else {
                console.log('  ✅ Job already exists in database');
            }
        } catch (dbJobError: any) {
            console.error('❌ Database error while inserting job:', dbJobError.message);
            return res.status(500).json({
                success: false,
                message: 'Database error while preparing job record',
                error: dbJobError.message
            });
        }

        // ===== CHECK PREREQUISITES =====
        if (!job.videoPath || !fs.existsSync(job.videoPath)) {
            console.error(`❌ Video file not found: ${job.videoPath}`);
            return res.status(400).json({
                success: false,
                message: 'Video file not found'
            });
        }

        if (!job.transcriptPath || !fs.existsSync(job.transcriptPath)) {
            console.error(`❌ Transcript file not found: ${job.transcriptPath}`);
            return res.status(400).json({
                success: false,
                message: 'Transcript not available. Please wait for transcription to complete.'
            });
        }

        // ===== LOAD TRANSCRIPT =====
        console.log('📄 Loading transcript...');
        let transcript: Transcript;
        try {
            const transcriptData = fs.readFileSync(job.transcriptPath, 'utf-8');
            transcript = JSON.parse(transcriptData);
            console.log(`✅ Transcript loaded: ${transcript.segments.length} segments`);
        } catch (parseError: any) {
            console.error('❌ Transcript parse error:', parseError.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to parse transcript file',
                error: parseError.message
            });
        }

        // ===== ANALYZE TRANSCRIPT =====
        console.log('🔍 Analyzing transcript for clip candidates...');
        let analysis: ClipAnalysisResult;
        try {
            analysis = clipDetector.analyzeTranscript(transcript, maxClips);
            console.log(`✅ Found ${analysis.candidates.length} clip candidates`);
        } catch (analysisError: any) {
            console.error('❌ Clip analysis error:', analysisError.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to analyze transcript',
                error: analysisError.message
            });
        }

        const candidates = analysis.candidates;

        if (candidates.length === 0) {
            console.warn('⚠️  No suitable clips found');
            return res.status(400).json({
                success: false,
                message: 'No suitable clips found in the transcript'
            });
        }

        // ===== DETERMINE CLIPS TO RENDER =====
        let clipsToRender: ClipCandidate[] = candidates;
        if (clipIndices && Array.isArray(clipIndices)) {
            clipsToRender = clipIndices
                .filter(idx => idx >= 0 && idx < candidates.length)
                .map(idx => candidates[idx]);
            console.log(`📌 Rendering selected ${clipsToRender.length} clips`);
        } else {
            console.log(`📌 Rendering all ${clipsToRender.length} clips`);
        }

        // ===== RENDER CLIPS =====
        console.log('🎬 Starting clip rendering...');
        const generatedClips: any[] = [];
        const isCloudinaryConfigured = cloudinaryService.isConfigured();

        for (let i = 0; i < clipsToRender.length; i++) {
            const candidate = clipsToRender[i];
            console.log(`  ⏳ Rendering clip ${i + 1}/${clipsToRender.length} (${candidate.startTime.toFixed(1)}s - ${candidate.endTime.toFixed(1)}s)...`);

            try {
                // Cut clip using FFmpeg (now outputs 9:16 vertical format)
                const clipPath = await videoCutter.cutClip(
                    job.videoPath,
                    candidate.startTime,
                    candidate.endTime,
                    jobId,
                    i
                );

                console.log(`    ✅ Clip rendered: ${path.basename(clipPath)}`);

                const clipId = uuidv4();
                let cloudinaryPublicId: string | null = null;
                let cloudinaryUrl: string | null = null;

                // Upload to Cloudinary if configured
                if (isCloudinaryConfigured) {
                    try {
                        console.log(`    ☁️ Uploading to Cloudinary...`);
                        const uploadResult = await cloudinaryService.uploadClip(clipPath, `${jobId}_${i}`);
                        cloudinaryPublicId = uploadResult.publicId;
                        cloudinaryUrl = uploadResult.secureUrl;
                        console.log(`    ✅ Cloudinary upload success: ${cloudinaryUrl}`);

                        // Delete local file after successful upload
                        cloudinaryService.deleteLocalFile(clipPath);
                    } catch (cloudinaryError: any) {
                        console.error(`    ⚠️ Cloudinary upload failed, keeping local file:`, cloudinaryError.message);
                        // Continue with local storage as fallback
                    }
                }

                // Save to database
                try {
                    queries.insertClip.run(
                        clipId,
                        jobId,
                        i,                                          // clip_index
                        clipPath,                                   // video_path
                        cloudinaryPublicId,                         // cloudinary_public_id
                        cloudinaryUrl,                              // cloudinary_url
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
                    console.log(`    ✅ Saved to database: ${clipId}`);
                } catch (dbInsertError: any) {
                    console.error(`    ❌ Database insert error for clip ${i}:`, dbInsertError.message);
                    throw new Error(`Failed to save clip ${i} to database: ${dbInsertError.message}`);
                }

                // Determine video URL (prefer Cloudinary URL if available)
                const videoUrl = cloudinaryUrl || `/storage/clips/${path.basename(clipPath)}`;

                generatedClips.push({
                    id: clipId,
                    jobId,
                    clipIndex: i,
                    videoPath: clipPath,
                    videoUrl: videoUrl,
                    cloudinaryUrl: cloudinaryUrl,
                    filename: path.basename(clipPath),
                    startTime: candidate.startTime,
                    endTime: candidate.endTime,
                    duration: candidate.duration,
                    text: candidate.text,
                    score: candidate.score,
                    selected: false,
                    createdAt: new Date().toISOString()
                });
            } catch (ffmpegError: any) {
                console.error(`    ❌ FFmpeg error for clip ${i}:`, ffmpegError.message);
                throw new Error(`Failed to render clip ${i}: ${ffmpegError.message}`);
            }
        }

        const renderTime = Date.now() - startTime;
        console.log(`✅ Rendered and saved ${generatedClips.length} clips in ${(renderTime / 1000).toFixed(1)}s\n`);

        res.json({
            success: true,
            jobId,
            clips: generatedClips,
            count: generatedClips.length,
            message: 'Clips rendered and saved to database'
        });

    } catch (error: any) {
        const renderTime = Date.now() - startTime;
        console.error(`❌ === CLIP RENDER FAILED (${(renderTime / 1000).toFixed(1)}s) ===`);
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);

        res.status(500).json({
            success: false,
            message: error.message || 'Failed to render clips',
            error: error.stack
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

/**
 * GET /api/clips/:clipId/download
 * Download a single clip as MP4
 */
router.get('/:clipId/download', async (req: Request, res: Response) => {
    const { clipId } = req.params;

    try {
        const clip = queries.getClipById.get(clipId) as ClipRow | undefined;

        if (!clip) {
            return res.status(404).json({
                success: false,
                message: 'Clip not found',
            });
        }

        // Prefer Cloudinary URL if available
        if (clip.cloudinary_url) {
            return res.redirect(clip.cloudinary_url);
        }

        // Fall back to local file
        const clipPath = clip.video_path;
        if (!fs.existsSync(clipPath)) {
            return res.status(404).json({
                success: false,
                message: 'Clip file not found',
            });
        }

        const filename = path.basename(clipPath);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const fileStream = fs.createReadStream(clipPath);
        fileStream.pipe(res);

    } catch (error: any) {
        console.error('Download error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Download failed',
        });
    }
});

/**
 * POST /api/clips/download-zip
 * Download multiple clips as a ZIP archive
 * Requires JWT authentication for 2+ clips
 */
router.post('/download-zip', async (req: Request, res: Response) => {
    const { clipIds } = req.body;

    try {
        // Validate input
        if (!clipIds || !Array.isArray(clipIds) || clipIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'clipIds array is required',
            });
        }

        // If only 1 clip, redirect to single download
        if (clipIds.length === 1) {
            return res.redirect(307, `/api/clips/${clipIds[0]}/download`);
        }

        // Require authentication for 2+ clips
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required for multi-clip download. Please log in.',
            });
        }

        // Verify JWT token
        const { authService } = require('../services/auth/authService');
        const token = authHeader.substring(7);
        const decoded = authService.verifyToken(token);

        if (!decoded) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token. Please log in again.',
            });
        }

        console.log(`📦 ZIP download requested by user ${decoded.userId} for ${clipIds.length} clips`);

        // Fetch clip paths
        const clipPaths: string[] = [];
        let jobId = '';

        for (const clipId of clipIds) {
            const clip = queries.getClipById.get(clipId) as ClipRow | undefined;
            if (clip && fs.existsSync(clip.video_path)) {
                clipPaths.push(clip.video_path);
                if (!jobId) jobId = clip.job_id;
            }
        }

        if (clipPaths.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No valid clips found',
            });
        }

        // Import and use zipExporter
        const { zipExporter } = require('../services/zipExporter');
        const zipFilename = zipExporter.generateZipFilename(jobId, clipPaths.length);

        // Set response headers for ZIP download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

        // Create and stream ZIP
        const zipStream = zipExporter.createZipStream(clipPaths);
        zipStream.pipe(res);

        zipStream.on('error', (err: Error) => {
            console.error('ZIP stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to create ZIP archive',
                });
            }
        });

    } catch (error: any) {
        console.error('ZIP download error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'ZIP download failed',
        });
    }
});

export default router;

