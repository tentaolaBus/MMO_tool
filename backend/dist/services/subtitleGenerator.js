"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSubtitlesForClip = generateSubtitlesForClip;
exports.formatSubtitleTime = formatSubtitleTime;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Extract subtitles from transcript for a specific clip timeframe
 */
async function generateSubtitlesForClip(jobId, clipId, clipStartTime, clipEndTime, language = 'en') {
    // Load transcript
    const transcriptPath = path_1.default.resolve('./storage/transcripts', `${jobId}.json`);
    if (!fs_1.default.existsSync(transcriptPath)) {
        throw new Error(`Transcript not found for job ${jobId}`);
    }
    const transcript = JSON.parse(fs_1.default.readFileSync(transcriptPath, 'utf-8'));
    // Filter segments that overlap with clip timeframe
    // Include segments where ANY part falls within the clip
    const clipSegments = transcript.segments.filter((seg) => {
        // Segment overlaps if:
        // - Segment starts before clip ends AND
        // - Segment ends after clip starts
        return seg.start < clipEndTime && seg.end > clipStartTime;
    });
    // Adjust timestamps to be relative to clip start (start from 0)
    const subtitleSegments = clipSegments.map((seg) => {
        // Calculate relative times
        const relativeStart = Math.max(0, seg.start - clipStartTime);
        const relativeEnd = Math.min(seg.end - clipStartTime, clipEndTime - clipStartTime);
        return {
            start: relativeStart,
            end: relativeEnd,
            text: seg.text.trim(),
        };
    });
    console.log(`Generated ${subtitleSegments.length} subtitle segments for clip ${clipId}`);
    console.log(`First segment:`, subtitleSegments[0]);
    console.log(`Last segment:`, subtitleSegments[subtitleSegments.length - 1]);
    return {
        clipId,
        jobId,
        language,
        segments: subtitleSegments,
        createdAt: new Date().toISOString(),
    };
}
/**
 * Format time for subtitle display (seconds to HH:MM:SS.mmm)
 */
function formatSubtitleTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hrs.toString().padStart(2, '0')}:${mins
        .toString()
        .padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms
        .toString()
        .padStart(3, '0')}`;
}
