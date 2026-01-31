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
        // Parse clipId to get jobId and clip metadata
        // Expected format: clip_<jobId>_<index>.mp4 or <jobId>_<index>
        const clipIdMatch = clipId.match(/^(?:clip_)?(.+?)_(\d+)(?:\.mp4)?$/);

        if (!clipIdMatch) {
            return res.status(400).json({
                success: false,
                message: 'Invalid clip ID format',
            });
        }

        const [, jobId, clipIndexStr] = clipIdMatch;
        const clipIndex = parseInt(clipIndexStr);

        // Load clip metadata to get start/end times
        const clipsMetadataPath = path.resolve('./storage/clips', `${jobId}_metadata.json`);

        let clipStartTime = 0;
        let clipEndTime = 0;

        if (fs.existsSync(clipsMetadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(clipsMetadataPath, 'utf-8'));
            const clipMeta = metadata.clips?.find((c: any) => c.clipIndex === clipIndex);

            if (clipMeta) {
                clipStartTime = clipMeta.startTime;
                clipEndTime = clipMeta.endTime;
            }
        }

        // If metadata not found, try to infer from existing clip data
        if (clipStartTime === 0 && clipEndTime === 0) {
            return res.status(404).json({
                success: false,
                message: 'Clip metadata not found. Please regenerate clips.',
            });
        }

        // Check cache
        const cacheDir = path.resolve('./storage/subtitles');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const cacheFile = path.join(cacheDir, `${clipId}_${language}.json`);

        // Return cached subtitles if available
        if (fs.existsSync(cacheFile)) {
            const cached: ClipSubtitles = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            return res.json({
                success: true,
                ...cached,
                cached: true,
            });
        }

        // Generate subtitles from transcript
        const subtitles = await generateSubtitlesForClip(
            jobId,
            clipId,
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
