import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { ClipSubtitles } from '../models/subtitle';
import { generateSubtitlesForClip } from '../services/subtitleGenerator';
import { translateSegments } from '../services/translator';
import { queries } from '../services/database';
import { subtitleRenderer } from '../services/subtitleRenderer';

const router = Router();

/**
 * GET /api/clips/:clipId/subtitles?lang=en
 * Get subtitles for a clip in specified language
 */
router.get('/:clipId/subtitles', async (req: Request, res: Response) => {
    const { clipId } = req.params;
    const language = (req.query.lang as string) || 'en';

    try {
        // First try to get clip from database by UUID
        const { queries } = require('../services/database');
        const clip = await queries.getClipById(clipId);

        let jobId: string;
        let clipIndex: number;
        let clipStartTime: number;
        let clipEndTime: number;

        if (clip) {
            // Clip found in database
            jobId = clip.job_id;
            clipIndex = clip.clip_index;
            clipStartTime = clip.start_time;
            clipEndTime = clip.end_time;
            console.log(`📋 Subtitle request for clip ${clipId} (job: ${jobId}, index: ${clipIndex})`);
        } else {
            // Fallback: Parse clipId in old format (clip_<jobId>_<index>.mp4)
            const clipIdMatch = clipId.match(/^(?:clip_)?(.+?)_(\d+)(?:\.mp4)?$/);

            if (!clipIdMatch) {
                // Return empty subtitles instead of 404 for graceful frontend handling
                console.log(`📋 Clip ${clipId} not found in DB and invalid format, returning empty subtitles`);
                return res.json({
                    success: true,
                    clipId,
                    segments: [],
                    cached: false,
                });
            }

            [, jobId,] = clipIdMatch;
            clipIndex = parseInt(clipIdMatch[2]);

            // Load clip metadata from file
            const clipsMetadataPath = path.resolve('./storage/clips', `${jobId}_metadata.json`);

            if (fs.existsSync(clipsMetadataPath)) {
                const metadata = JSON.parse(fs.readFileSync(clipsMetadataPath, 'utf-8'));
                const clipMeta = metadata.clips?.find((c: any) => c.clipIndex === clipIndex);

                if (clipMeta) {
                    clipStartTime = clipMeta.startTime;
                    clipEndTime = clipMeta.endTime;
                } else {
                    // Return empty subtitles instead of 404
                    console.log(`📋 Clip metadata entry not found for ${clipId}, returning empty subtitles`);
                    return res.json({
                        success: true,
                        clipId,
                        segments: [],
                        cached: false,
                    });
                }
            } else {
                // Return empty subtitles instead of 404
                console.log(`📋 Metadata file not found for ${clipId}, returning empty subtitles`);
                return res.json({
                    success: true,
                    clipId,
                    segments: [],
                    cached: false,
                });
            }
        }

        // Check cache - file format is {jobId}_{clipIndex}_{language}.json
        const cacheDir = path.resolve('./storage/subtitles');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        // Try edited version first, then original
        const cacheFileBase = `${jobId}_${clipIndex}_${language}`;
        const editedCacheFile = path.join(cacheDir, `${cacheFileBase}_edited.json`);
        const cacheFile = path.join(cacheDir, `${cacheFileBase}.json`);

        // Return edited cached subtitles if available
        if (fs.existsSync(editedCacheFile)) {
            const cached: ClipSubtitles = JSON.parse(fs.readFileSync(editedCacheFile, 'utf-8'));
            return res.json({
                success: true,
                ...cached,
                cached: true,
                edited: true,
            });
        }

        // Return original cached subtitles if available
        if (fs.existsSync(cacheFile)) {
            const cached: ClipSubtitles = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            return res.json({
                success: true,
                ...cached,
                cached: true,
            });
        }

        // Generate subtitles from transcript
        console.log(`🎬 Generating subtitles for clip ${clipId} (job: ${jobId}, index: ${clipIndex})`);
        const subtitles = await generateSubtitlesForClip(
            jobId,
            `${jobId}_${clipIndex}`,  // Use consistent clipId format for generator
            clipStartTime,
            clipEndTime,
            'en' // Always generate in English first
        );

        // Translate if needed
        if (language !== 'en' && subtitles.segments.length > 0) {
            const translatedTexts = await translateSegments(subtitles.segments, language);

            subtitles.segments = subtitles.segments.map((seg, idx) => ({
                ...seg,
                text: translatedTexts[idx],
            }));

            subtitles.language = language;
        }

        // Cache the result
        fs.writeFileSync(cacheFile, JSON.stringify(subtitles, null, 2));

        res.json({
            success: true,
            ...subtitles,
            cached: false,
        });

    } catch (error: any) {
        console.error('Error generating subtitles:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate subtitles',
        });
    }
});

/**
 * PUT /api/clips/:clipId/subtitles
 * Update edited subtitles for a clip
 */
router.put('/:clipId/subtitles', async (req: Request, res: Response) => {
    const { clipId } = req.params;
    const { language, segments } = req.body;

    try {
        // Validate input
        if (!language || !segments || !Array.isArray(segments)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request: language and segments are required',
            });
        }

        // Validate subtitles
        const { validateSubtitles, autoFixSubtitles } = require('../services/subtitleValidator');
        const errors = validateSubtitles(segments);

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Subtitle validation failed',
                errors,
            });
        }

        // Auto-fix small gaps/overlaps
        const fixedSegments = autoFixSubtitles(segments);

        // Save edited subtitles
        const cacheDir = path.resolve('./storage/subtitles');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const editedFile = path.join(cacheDir, `${clipId}_${language}_edited.json`);

        const editedSubtitles: ClipSubtitles = {
            clipId,
            jobId: clipId.split('_')[0],
            language,
            segments: fixedSegments,
            createdAt: new Date().toISOString(),
        };

        fs.writeFileSync(editedFile, JSON.stringify(editedSubtitles, null, 2));

        console.log(`Saved edited subtitles for ${clipId} (${language})`);

        res.json({
            success: true,
            ...editedSubtitles,
            validated: true,
            savedAt: new Date().toISOString(),
        });

    } catch (error: any) {
        console.error('Error saving edited subtitles:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to save edited subtitles',
        });
    }
});

// ────────────────────────────────────────────────────────────────────────
// Subtitle Style endpoints
// ────────────────────────────────────────────────────────────────────────

const STYLES_DIR = path.resolve('./storage/subtitle-styles');

/**
 * GET /api/clips/:clipId/subtitle-style
 * Load saved subtitle style for a clip
 */
router.get('/:clipId/subtitle-style', (req: Request, res: Response) => {
    const { clipId } = req.params;

    try {
        if (!fs.existsSync(STYLES_DIR)) {
            return res.json({ success: true, style: null });
        }

        const filePath = path.join(STYLES_DIR, `${clipId}.json`);
        if (!fs.existsSync(filePath)) {
            return res.json({ success: true, style: null });
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json({ success: true, style: data.style, enabled: data.enabled ?? true });
    } catch (error: any) {
        console.error('Error loading subtitle style:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/clips/:clipId/subtitle-style
 * Save subtitle style + auto-render video with burned-in subtitles
 */
router.post('/:clipId/subtitle-style', async (req: Request, res: Response) => {
    const { clipId } = req.params;
    const { style, enabled, language = 'en' } = req.body;

    try {
        // ── STEP 1: Validate ────────────────────────────────────────────
        if (!style || typeof style !== 'object') {
            return res.status(400).json({ success: false, message: 'style object is required' });
        }

        interface ClipRow {
            id: string; job_id: string; clip_index: number; video_path: string;
        }

        const clip = await queries.getClipById(clipId) as ClipRow | undefined;
        if (!clip) {
            return res.status(404).json({ success: false, message: 'Clip not found in database' });
        }

        // We need the ORIGINAL clip path (from storage/clips/) for rendering,
        // not a previously rendered path
        const originalClipDir = path.resolve('./storage/clips');
        const originalFilename = `clip_${clip.job_id}_${clip.clip_index}.mp4`;
        let clipPath = path.join(originalClipDir, originalFilename);

        console.log(`🔍 Save Style — resolving clip path:`);
        console.log(`   DB video_path:     ${clip.video_path}`);
        console.log(`   Convention path:   ${clipPath}`);
        console.log(`   Convention exists: ${fs.existsSync(clipPath)}`);

        // Fallback: if the file doesn't exist at the expected path, use the DB path
        if (!fs.existsSync(clipPath)) {
            clipPath = clip.video_path;
            console.log(`   Fallback to DB:    ${clipPath}`);
            console.log(`   Fallback exists:   ${fs.existsSync(clipPath)}`);
        }

        if (!fs.existsSync(clipPath)) {
            console.error(`   ❌ CLIP FILE NOT FOUND on disk at any path`);
            return res.status(404).json({
                success: false,
                message: 'Clip video file not found on disk',
                hint: `Tried: ${path.join(originalClipDir, originalFilename)} and ${clip.video_path}. Re-render clips to regenerate files.`,
            });
        }

        const subtitleEnabled = enabled !== undefined ? enabled : true;

        // ── STEP 2: Save style config ───────────────────────────────────
        if (!fs.existsSync(STYLES_DIR)) {
            fs.mkdirSync(STYLES_DIR, { recursive: true });
        }

        const styleFilePath = path.join(STYLES_DIR, `${clipId}.json`);
        fs.writeFileSync(styleFilePath, JSON.stringify({
            clipId,
            style,
            enabled: subtitleEnabled,
            updatedAt: new Date().toISOString(),
        }, null, 2));

        console.log(`💾 Saved subtitle style for clip ${clipId}`);

        // ── STEP 3: Auto-render ─────────────────────────────────────────
        const startTime = Date.now();
        let segments: any[] = [];

        if (subtitleEnabled) {
            const subtitlesDir = path.resolve('./storage/subtitles');
            const cacheKey = `${clip.job_id}_${clip.clip_index}_${language}`;

            // Try edited subtitles first, then original
            let subtitlesFile = path.join(subtitlesDir, `${cacheKey}_edited.json`);
            if (!fs.existsSync(subtitlesFile)) {
                subtitlesFile = path.join(subtitlesDir, `${cacheKey}.json`);
            }

            if (fs.existsSync(subtitlesFile)) {
                const data = JSON.parse(fs.readFileSync(subtitlesFile, 'utf-8'));
                segments = data.segments || [];
            }

            if (segments.length === 0) {
                console.log(`⚠️ No subtitle segments found for ${cacheKey}, rendering without subtitles`);
            }
        }

        const finalVideoPath = await subtitleRenderer.renderWithSubtitles(
            clipPath,
            segments,
            clipId,
            style,
            subtitleEnabled && segments.length > 0
        );

        const renderTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const finalFilename = path.basename(finalVideoPath);
        const renderedVideoUrl = `/storage/final/${finalFilename}`;

        console.log(`✅ Render complete: ${renderedVideoUrl} (${renderTime}s, ${segments.length} subtitles)`);

        // ── STEP 4: Update DB ───────────────────────────────────────────
        const oldVideoPath = clip.video_path;
        await queries.updateClipVideoPath(finalVideoPath, clipId);

        // ── DIAGNOSTIC: Verify pipeline integrity ───────────────────────
        const newFileSize = fs.existsSync(finalVideoPath) ? fs.statSync(finalVideoPath).size : 0;
        console.log(`\n📊 ═══ SAVE STYLE DIAGNOSTIC ═══`);
        console.log(`   Clip ID:       ${clipId}`);
        console.log(`   Old path:      ${oldVideoPath}`);
        console.log(`   New path:      ${finalVideoPath}`);
        console.log(`   New file size: ${(newFileSize / 1024).toFixed(0)} KB`);
        console.log(`   URL will be:   ${renderedVideoUrl}`);
        console.log(`   DB updated_at: ${new Date().toISOString()}`);
        console.log(`═══════════════════════════════\n`);

        // ── STEP 5: Return response ─────────────────────────────────────
        res.json({
            success: true,
            clipId,
            renderedVideoUrl,
            renderTime: parseFloat(renderTime),
            message: 'Style saved and video rendered',
        });

    } catch (error: any) {
        console.error('Error saving style / rendering video:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to render styled video',
        });
    }
});

export default router;
