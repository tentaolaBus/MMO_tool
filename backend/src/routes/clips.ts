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


// #region agent log
const _dbglog = (loc: string, msg: string, data: any = {}, hyp: string = '') => {
    try { fs.appendFileSync(path.resolve(__dirname, '../../..', 'debug-0170bb.log'), JSON.stringify({ sessionId: '0170bb', location: loc, message: msg, data, timestamp: Date.now(), hypothesisId: hyp }) + '\n'); } catch { }
};
// #endregion

const router = Router();

/**
 * Safely parse the keywords field from Supabase.
 * It may be: a JSON string, an already-parsed array, null, or invalid.
 */
function safeParseKeywords(keywords: any): string[] {
    if (!keywords) return [];
    if (Array.isArray(keywords)) return keywords;
    try {
        const parsed = JSON.parse(keywords);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Build a videoUrl from a clip row.
 * Always resolves to a local storage path.
 */
function buildVideoUrl(clip: any): string {
    const vp = clip.video_path || '';

    // Local storage path
    if (vp.includes('storage')) {
        const after = vp.split(/[\\/]storage[\\/]/)[1];
        return after ? `/storage/${after.replace(/\\/g, '/')}` : `/storage/clips/${path.basename(vp)}`;
    }
    return `/storage/clips/${path.basename(vp)}`;
}

// Type for clip database row
interface ClipRow {
    id: string;
    job_id: string;
    clip_index: number;
    video_path: string;
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
 *
 * DIAGNOSTIC VERSION — numbered STAGE logs + structured error output
 */
router.post('/render', async (req: Request, res: Response) => {
    const startTime = Date.now();
    let currentStage = 'INIT';

    console.log('\n🎬 ========================================');
    console.log('   POST /clips/render — DIAGNOSTIC MODE');
    console.log('========================================');

    try {
        const { jobId, maxClips = 10, clipIndices } = req.body;

        // ===== STAGE 0: VALIDATION =====
        currentStage = 'STAGE_0_VALIDATION';
        console.log('\n📋 STAGE 0: Validating request params...');
        console.log(`   jobId=${jobId} (type: ${typeof jobId})`);
        console.log(`   maxClips=${maxClips} (type: ${typeof maxClips})`);
        console.log(`   clipIndices=${JSON.stringify(clipIndices)}`);

        if (!jobId || typeof jobId !== 'string') {
            console.error('   ❌ FAIL: Missing or invalid jobId');
            return res.status(400).json({
                success: false,
                stage: currentStage,
                message: 'Missing or invalid jobId parameter'
            });
        }

        if (typeof maxClips !== 'number' || maxClips < 1 || maxClips > 50) {
            console.error(`   ❌ FAIL: Invalid maxClips value: ${maxClips}`);
            return res.status(400).json({
                success: false,
                stage: currentStage,
                message: 'maxClips must be a number between 1 and 50'
            });
        }
        console.log('   ✅ STAGE 0 PASSED');

        // ===== STAGE 1: CHECK EXISTING CLIPS IN DATABASE =====
        currentStage = 'STAGE_1_CHECK_EXISTING_CLIPS';
        console.log('\n🔍 STAGE 1: Checking if clips already exist in database...');
        try {
            const existingClips = await queries.getClipsByJob(jobId);
            console.log(`   Supabase returned: ${existingClips?.length ?? 'null'} clips`);

            if (existingClips && existingClips.length > 0) {
                console.log(`   ✅ STAGE 1: Found ${existingClips.length} existing clips — returning cached`);
                return res.json({
                    success: true,
                    jobId,
                    clips: existingClips.map((c: any) => ({
                        id: c.id,
                        jobId: c.job_id,
                        clipIndex: c.clip_index,
                        videoPath: c.video_path,
                        videoUrl: buildVideoUrl(c),
                        filename: path.basename(c.video_path || ''),
                        startTime: c.start_time,
                        endTime: c.end_time,
                        duration: c.duration,
                        text: c.text,
                        score: {
                            total: c.score_total,
                            durationScore: c.score_duration,
                            keywordScore: c.score_keyword,
                            completenessScore: c.score_completeness,
                            keywords: safeParseKeywords(c.keywords)
                        },
                        selected: !!c.selected,
                        createdAt: c.created_at,
                        updatedAt: c.updated_at || c.created_at
                    })),
                    count: existingClips.length,
                    message: 'Clips loaded from database (already rendered)'
                });
            }
            console.log('   ✅ STAGE 1 PASSED (no existing clips)');
        } catch (dbError: any) {
            console.error('   ❌ STAGE 1 FAILED — Supabase getClipsByJob error');
            console.error('   Error:', dbError.message);
            console.error('   Full error:', JSON.stringify(dbError, null, 2));
            return res.status(500).json({
                success: false,
                stage: currentStage,
                message: 'Database error while checking for existing clips',
                error: dbError.message,
                hint: 'Check if "clips" table exists in Supabase and SUPABASE_SERVICE_KEY is correct'
            });
        }

        // ===== STAGE 2: FETCH JOB FROM IN-MEMORY QUEUE =====
        currentStage = 'STAGE_2_FETCH_JOB';
        console.log('\n📦 STAGE 2: Fetching job from in-memory queue...');
        const job = jobQueue.getJob(jobId);
        if (!job) {
            console.error(`   ❌ STAGE 2 FAILED — Job "${jobId}" not in memory`);
            console.error('   Available jobs:', JSON.stringify(
                jobQueue.getAllJobs().map(j => ({ id: j.id, status: j.status }))
            ));
            return res.status(404).json({
                success: false,
                stage: currentStage,
                message: `Job not found in memory: ${jobId}`,
                hint: 'The in-memory job queue loses data on server restart. Re-upload the video.'
            });
        }

        console.log('   JOB DETAILS:');
        console.log(`     id:             ${job.id}`);
        console.log(`     status:         ${job.status}`);
        console.log(`     progress:       ${job.progress}`);
        console.log(`     videoPath:      ${job.videoPath ?? 'NULL ⚠️'}`);
        console.log(`     audioPath:      ${job.audioPath ?? 'NULL'}`);
        console.log(`     transcriptPath: ${job.transcriptPath ?? 'NULL ⚠️'}`);
        console.log('   ✅ STAGE 2 PASSED');

        // ===== STAGE 2.5: CHECK JOB STATUS =====
        currentStage = 'STAGE_2_5_CHECK_STATUS';
        console.log(`\n⏳ STAGE 2.5: Checking job processing status...`);
        console.log(`   Current status: ${job.status}`);

        if (job.status === 'pending' || job.status === 'processing') {
            console.log(`   ⏳ Job still ${job.status} — returning 202 (retry later)`);
            return res.status(202).json({
                success: false,
                status: job.status,
                progress: job.progress || 0,
                message: `Transcription still in progress (${job.status}).`,
                retryAfterMs: 5000
            });
        }

        if (job.status === 'failed') {
            console.log(`   ❌ Job failed: ${job.error}`);
            return res.status(422).json({
                success: false,
                status: 'failed',
                message: job.error || 'Transcription failed',
                hint: 'Re-upload the video to try again'
            });
        }

        console.log('   ✅ STAGE 2.5 PASSED (status: completed)');

        // ===== STAGE 3: ENSURE JOB IN DATABASE =====
        currentStage = 'STAGE_3_ENSURE_JOB_IN_DB';
        console.log(`\n💾 STAGE 3: Ensuring job exists in Supabase (jobId: ${jobId})...`);
        try {
            const existingJob = await queries.getJob(jobId);
            console.log(`   Supabase getJob result: ${existingJob ? 'EXISTS' : 'NOT FOUND'} (jobId: ${jobId})`);

            if (!existingJob) {
                console.log(`   Upserting job into Supabase (jobId: ${jobId})...`);
                await queries.insertJob(
                    job.id,
                    job.status,
                    job.progress || 0,
                    job.videoPath || '',
                    job.audioPath || null,
                    job.transcriptPath || null
                );
                console.log(`   ✅ Job upserted into Supabase (jobId: ${jobId})`);
            }
            console.log('   ✅ STAGE 3 PASSED');
        } catch (dbJobError: any) {
            console.error('   ❌ STAGE 3 FAILED — Supabase job insert/check error');
            console.error('   Error:', dbJobError.message);
            return res.status(500).json({
                success: false,
                stage: currentStage,
                message: 'Database error while preparing job record',
                error: dbJobError.message,
                hint: 'Check if "jobs" table exists in Supabase with correct columns'
            });
        }

        // ===== STAGE 4: VERIFY FILE SYSTEM =====
        currentStage = 'STAGE_4_VERIFY_FILES';
        console.log('\n📂 STAGE 4: Verifying file system...');

        // Check video file
        const videoExists = job.videoPath ? fs.existsSync(job.videoPath) : false;
        console.log(`   Video path:  ${job.videoPath ?? 'NULL'}`);
        console.log(`   Video exists: ${videoExists}`);
        if (!job.videoPath || !videoExists) {
            console.error('   ❌ STAGE 4 FAILED — Video file not found');
            return res.status(400).json({
                success: false,
                stage: currentStage,
                message: `Video file not found: ${job.videoPath}`,
                hint: 'The video file may have been deleted or the path is wrong'
            });
        }

        // Check transcript file
        const transcriptExists = job.transcriptPath ? fs.existsSync(job.transcriptPath) : false;
        console.log(`   Transcript path:  ${job.transcriptPath ?? 'NULL'}`);
        console.log(`   Transcript exists: ${transcriptExists}`);
        if (!job.transcriptPath || !transcriptExists) {
            console.error('   ❌ STAGE 4 FAILED — Transcript file not found');
            return res.status(400).json({
                success: false,
                stage: currentStage,
                message: `Transcript not available: ${job.transcriptPath}`,
                hint: 'Wait for transcription to complete before rendering clips'
            });
        }

        // Ensure clips output directory exists
        const clipsDir = path.resolve('./storage/clips');
        if (!fs.existsSync(clipsDir)) {
            console.log(`   Creating clips directory: ${clipsDir}`);
            fs.mkdirSync(clipsDir, { recursive: true });
        }
        console.log(`   Clips dir: ${clipsDir} (exists: true)`);

        // Ensure temp directory exists
        const tempDir = path.resolve('./storage/temp');
        if (!fs.existsSync(tempDir)) {
            console.log(`   Creating temp directory: ${tempDir}`);
            fs.mkdirSync(tempDir, { recursive: true });
        }

        console.log('   ✅ STAGE 4 PASSED');

        // ===== STAGE 5: LOAD & ANALYZE TRANSCRIPT =====
        currentStage = 'STAGE_5_ANALYZE_TRANSCRIPT';
        console.log('\n📄 STAGE 5: Loading and analyzing transcript...');
        let transcript: Transcript;
        try {
            const transcriptData = fs.readFileSync(job.transcriptPath, 'utf-8');
            transcript = JSON.parse(transcriptData);
            console.log(`   Segments: ${transcript.segments?.length ?? 'NULL ⚠️'}`);
            console.log(`   Language: ${transcript.language ?? 'NULL'}`);
            console.log(`   Duration: ${transcript.duration ?? 'NULL'}`);

            if (!transcript.segments || transcript.segments.length === 0) {
                console.error('   ❌ STAGE 5 FAILED — Transcript has no segments');
                return res.status(400).json({
                    success: false,
                    stage: currentStage,
                    message: 'Transcript file has no segments',
                    hint: 'The transcription may have produced empty results'
                });
            }
        } catch (parseError: any) {
            console.error('   ❌ STAGE 5 FAILED — Transcript parse error');
            console.error('   Error:', parseError.message);
            return res.status(500).json({
                success: false,
                stage: currentStage,
                message: 'Failed to parse transcript file',
                error: parseError.message
            });
        }

        let analysis: ClipAnalysisResult;
        try {
            analysis = clipDetector.analyzeTranscript(transcript, maxClips);
            console.log(`   Clip candidates found: ${analysis.candidates.length}`);
        } catch (analysisError: any) {
            console.error('   ❌ STAGE 5 FAILED — clipDetector.analyzeTranscript threw');
            console.error('   Error:', analysisError.message);
            console.error('   Stack:', analysisError.stack);
            return res.status(500).json({
                success: false,
                stage: currentStage,
                message: 'Failed to analyze transcript',
                error: analysisError.message
            });
        }

        const candidates = analysis.candidates;
        if (candidates.length === 0) {
            console.warn('   ⚠️ No suitable clips found');
            return res.status(400).json({
                success: false,
                stage: currentStage,
                message: 'No suitable clips found in the transcript'
            });
        }

        let clipsToRender: ClipCandidate[] = candidates;
        if (clipIndices && Array.isArray(clipIndices)) {
            clipsToRender = clipIndices
                .filter(idx => idx >= 0 && idx < candidates.length)
                .map(idx => candidates[idx]);
        }
        console.log(`   Clips to render: ${clipsToRender.length}`);
        console.log('   ✅ STAGE 5 PASSED');

        // ===== STAGE 6: RENDER CLIPS (FFmpeg) =====
        currentStage = 'STAGE_6_RENDER_CLIPS';
        console.log('\n🎬 STAGE 6: Rendering clips with FFmpeg...');
        const generatedClips: any[] = [];
        const failedClips: Array<{ index: number; error: string; stage: string }> = [];

        for (let i = 0; i < clipsToRender.length; i++) {
            const candidate = clipsToRender[i];
            console.log(`\n   --- Clip ${i + 1}/${clipsToRender.length} ---`);
            console.log(`   Time: ${candidate.startTime.toFixed(1)}s → ${candidate.endTime.toFixed(1)}s (${candidate.duration.toFixed(1)}s)`);

            try {
                // 6a: Cut clip using FFmpeg
                console.log(`   [6a] FFmpeg cutting...`);
                const clipPath = await videoCutter.cutClip(
                    job.videoPath,
                    candidate.startTime,
                    candidate.endTime,
                    jobId,
                    i
                );
                console.log(`   [6a] ✅ Clip file: ${path.basename(clipPath)}`);

                const clipId = uuidv4();

                // 6b: Save to Supabase
                console.log(`   [6b] Saving to Supabase (video_path: local disk)...`);
                try {
                    await queries.insertClip(
                        clipId,
                        jobId,
                        i,
                        clipPath,
                        candidate.startTime,
                        candidate.endTime,
                        candidate.duration,
                        candidate.text,
                        candidate.score.total,
                        candidate.score.durationScore,
                        candidate.score.keywordScore,
                        candidate.score.completenessScore,
                        JSON.stringify(candidate.score.keywords),
                        0,
                        1
                    );
                    console.log(`   [6b] ✅ Supabase insert success (clipId: ${clipId})`);
                } catch (dbInsertError: any) {
                    console.error(`   [6b] ❌ SUPABASE INSERT FAILED for clip ${i}`);
                    console.error(`   [6b] Error: ${dbInsertError.message}`);
                    console.error(`   [6b] Full error:`, JSON.stringify(dbInsertError, null, 2));
                    failedClips.push({ index: i, error: `Supabase insert: ${dbInsertError.message}`, stage: 'STAGE_6b_DB_INSERT' });
                    continue;
                }

                const videoUrl = `/storage/clips/${path.basename(clipPath)}`;

                generatedClips.push({
                    id: clipId,
                    jobId,
                    clipIndex: i,
                    videoPath: clipPath,
                    videoUrl: videoUrl,
                    filename: path.basename(clipPath),
                    startTime: candidate.startTime,
                    endTime: candidate.endTime,
                    duration: candidate.duration,
                    text: candidate.text,
                    score: candidate.score,
                    selected: false,
                    createdAt: new Date().toISOString()
                });
            } catch (clipError: any) {
                console.error(`   ❌ Clip ${i} FAILED`);
                console.error(`   Error: ${clipError.message}`);
                if (clipError.stderr) console.error(`   FFmpeg stderr: ${clipError.stderr.slice(-300)}`);
                failedClips.push({ index: i, error: clipError.message, stage: 'STAGE_6_FFMPEG' });
            }
        }

        console.log(`\n   STAGE 6 SUMMARY: ${generatedClips.length} succeeded, ${failedClips.length} failed`);

        // ===== STAGE 7: RETURN RESPONSE =====
        currentStage = 'STAGE_7_RESPONSE';
        const renderTime = Date.now() - startTime;

        if (generatedClips.length === 0) {
            console.error(`\n❌ ALL ${clipsToRender.length} clips failed (${(renderTime / 1000).toFixed(1)}s)`);
            return res.status(500).json({
                success: false,
                stage: currentStage,
                message: 'All clips failed to render',
                failedClips,
                renderTimeMs: renderTime,
                hint: 'Check failedClips array for per-clip errors'
            });
        }

        if (failedClips.length > 0) {
            console.warn(`⚠️ ${failedClips.length}/${clipsToRender.length} clips failed, ${generatedClips.length} succeeded`);
        }

        console.log(`\n✅ RENDER COMPLETE: ${generatedClips.length} clips in ${(renderTime / 1000).toFixed(1)}s`);

        // Pre-validate clips to prevent serialization crashes
        const safeClips = generatedClips.map((clip: any, idx: number) => {
            try {
                // Ensure all fields are serializable (no circular refs, no undefined funcs)
                const safe = {
                    id: clip.id || '',
                    jobId: clip.jobId || jobId,
                    clipIndex: typeof clip.clipIndex === 'number' ? clip.clipIndex : idx,
                    videoPath: typeof clip.videoPath === 'string' ? clip.videoPath : '',
                    videoUrl: typeof clip.videoUrl === 'string' ? clip.videoUrl : '',

                    filename: typeof clip.filename === 'string' ? clip.filename : '',
                    startTime: clip.startTime ?? 0,
                    endTime: clip.endTime ?? 0,
                    duration: clip.duration ?? 0,
                    text: clip.text || '',
                    score: {
                        total: clip.score?.total ?? 0,
                        durationScore: clip.score?.durationScore ?? 0,
                        keywordScore: clip.score?.keywordScore ?? 0,
                        completenessScore: clip.score?.completenessScore ?? 0,
                        keywords: Array.isArray(clip.score?.keywords) ? clip.score.keywords : []
                    },
                    selected: !!clip.selected,
                    createdAt: clip.createdAt || new Date().toISOString()
                };
                return safe;
            } catch (clipErr: any) {
                console.error(`   ❌ Clip ${idx} validation failed:`, clipErr.message);
                return null;
            }
        }).filter(Boolean);

        console.log(`   Safe clips count: ${safeClips.length}`);
        console.log(`   Headers already sent: ${res.headersSent}`);

        if (res.headersSent) {
            console.error('   ❌ FATAL: Headers already sent before STAGE 7 response!');
            return;
        }

        try {
            const responsePayload = {
                success: true,
                jobId,
                clips: safeClips,
                count: safeClips.length,
                failedCount: failedClips.length,
                failedClips: failedClips.length > 0 ? failedClips : undefined,
                renderTimeMs: renderTime,
                message: failedClips.length > 0
                    ? `${safeClips.length} clips rendered, ${failedClips.length} failed`
                    : 'Clips rendered and saved to database'
            };

            // Test serialization BEFORE sending
            JSON.stringify(responsePayload);
            console.log('   ✅ Response payload serializes OK');

            res.json(responsePayload);
            console.log('   ✅ STAGE 7: Response sent successfully');
        } catch (responseErr: any) {
            console.error('   ❌ STAGE 7: Response serialization/send FAILED');
            console.error('   Error:', responseErr.message);
            console.error('   Stack:', responseErr.stack);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    stage: 'STAGE_7_RESPONSE_SERIALIZE',
                    message: `Failed to send response: ${responseErr.message}`,
                });
            }
        }

        console.log('========================================\n');

    } catch (error: any) {
        const renderTime = Date.now() - startTime;
        console.error('\n❌ ========================================');
        console.error('   RENDER_CLIPS_FATAL — Unhandled crash');
        console.error('========================================');
        console.error(`Stage:   ${currentStage}`);
        console.error(`Time:    ${(renderTime / 1000).toFixed(1)}s`);
        console.error(`Message: ${error.message}`);
        console.error(`Stack:   ${error.stack}`);
        console.error('========================================\n');

        try {
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    stage: currentStage,
                    message: error instanceof Error ? error.message : 'Unknown error',
                    error: error instanceof Error ? error.message : String(error),
                    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
                    renderTimeMs: renderTime,
                    hint: `Failure occurred at ${currentStage}. Check backend terminal for full stack trace.`
                });
            } else {
                console.error('   ⚠️ Could not send error response (headers already sent)');
            }
        } catch (finalErr) {
            console.error('   ⚠️ Could not send error response:', finalErr);
        }
    }
});

/**
 * GET /api/clips/:jobId
 * Get all clips for a job from database
 */
router.get('/:jobId', async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;

        const clips = await queries.getClipsByJob(jobId);

        // Format clips for frontend
        const formattedClips = clips.map((c: any) => ({
            id: c.id,
            jobId: c.job_id,
            clipIndex: c.clip_index,
            videoPath: c.video_path,
            videoUrl: buildVideoUrl(c),
            filename: path.basename(c.video_path || ''),
            startTime: c.start_time,
            endTime: c.end_time,
            duration: c.duration,
            text: c.text,
            score: {
                total: c.score_total,
                durationScore: c.score_duration,
                keywordScore: c.score_keyword,
                completenessScore: c.score_completeness,
                keywords: safeParseKeywords(c.keywords)
            },
            selected: !!c.selected,
            createdAt: c.created_at,
            updatedAt: c.updated_at || c.created_at
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

        await queries.updateClipSelection(selected ? 1 : 0, clipId);

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

        const selectedClips = await queries.getSelectedClips(jobId);

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
 * GET /api/clips/:clipId/download
 * Download a single clip as MP4
 */
router.get('/:clipId/download', async (req: Request, res: Response) => {
    const { clipId } = req.params;

    try {
        const clip = await queries.getClipById(clipId) as ClipRow | undefined;

        if (!clip) {
            return res.status(404).json({
                success: false,
                message: 'Clip not found',
            });
        }

        // Serve local file
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

        console.log(`📦 ZIP download requested for ${clipIds.length} clips`);

        // Fetch clip paths
        const clipPaths: string[] = [];
        let jobId = '';

        for (const clipId of clipIds) {
            const clip = await queries.getClipById(clipId) as ClipRow | undefined;
            // #region agent log
            _dbglog('clips.ts:zip-lookup', 'Clip lookup for ZIP', { clipId, found: !!clip, videoPath: clip?.video_path || null, fileExists: clip ? fs.existsSync(clip.video_path) : false, fileSize: clip && fs.existsSync(clip.video_path) ? fs.statSync(clip.video_path).size : 0 }, 'ZIP-H1');
            // #endregion
            if (clip && fs.existsSync(clip.video_path)) {
                clipPaths.push(clip.video_path);
                if (!jobId) jobId = clip.job_id;
            }
        }

        // #region agent log
        _dbglog('clips.ts:zip-paths', 'Clip paths resolved', { clipPathCount: clipPaths.length, clipPaths, jobId }, 'ZIP-H1');
        // #endregion

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

        zipStream.on('end', () => {
            // #region agent log
            _dbglog('clips.ts:zip-end', 'ZIP stream ended successfully', { clipPathCount: clipPaths.length }, 'ZIP-H2');
            // #endregion
            console.log('📦 ZIP stream completed successfully');
        });

        zipStream.on('error', (err: Error) => {
            // #region agent log
            _dbglog('clips.ts:zip-error', 'ZIP stream ERROR', { error: err.message, stack: err.stack }, 'ZIP-H2');
            // #endregion
            console.error('ZIP stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to create ZIP archive',
                });
            }
        });

        res.on('close', () => {
            // #region agent log
            _dbglog('clips.ts:res-close', 'Response closed', { headersSent: res.headersSent, writableEnded: res.writableEnded, statusCode: res.statusCode }, 'ZIP-H3');
            // #endregion
        });

        zipStream.pipe(res);

    } catch (error: any) {
        // #region agent log
        _dbglog('clips.ts:zip-catch', 'ZIP endpoint CATCH error', { error: error.message, stack: error.stack }, 'ZIP-H2');
        // #endregion
        console.error('ZIP download error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'ZIP download failed',
        });
    }
});

export default router;

