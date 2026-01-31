import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { ClipSubtitles } from '../models/subtitle';
import { generateSubtitlesForClip } from '../services/subtitleGenerator';
import { translateSegments } from '../services/translator';

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
        const clip = queries.getClipById.get(clipId);

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
                return res.status(404).json({
                    success: false,
                    message: 'Clip not found in database and invalid clip ID format',
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
                    return res.status(404).json({
                        success: false,
                        message: 'Clip metadata not found',
                    });
                }
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'Clip metadata file not found',
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

export default router;
