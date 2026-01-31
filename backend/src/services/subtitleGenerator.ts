import fs from 'fs';
import path from 'path';
import { SubtitleSegment, ClipSubtitles } from '../models/subtitle';

interface TranscriptSegment {
    id: number;
    start: number;
    end: number;
    text: string;
}

interface Transcript {
    jobId: string;
    language: string;
    duration: number;
    segments: TranscriptSegment[];
}

/**
 * Extract subtitles from transcript for a specific clip timeframe
 */
export async function generateSubtitlesForClip(
    jobId: string,
    clipId: string,
    clipStartTime: number,
    clipEndTime: number,
    language: string = 'en'
): Promise<ClipSubtitles> {
    // Load transcript
    const transcriptPath = path.resolve('./storage/transcripts', `${jobId}.json`);

    if (!fs.existsSync(transcriptPath)) {
        throw new Error(`Transcript not found for job ${jobId}`);
    }

    const transcript: Transcript = JSON.parse(
        fs.readFileSync(transcriptPath, 'utf-8')
    );

    // Filter segments that overlap with clip timeframe
    // Include segments where ANY part falls within the clip
    const clipSegments = transcript.segments.filter(
        (seg) => {
            // Segment overlaps if:
            // - Segment starts before clip ends AND
            // - Segment ends after clip starts
            return seg.start < clipEndTime && seg.end > clipStartTime;
        }
    );

    // Adjust timestamps to be relative to clip start (start from 0)
    const subtitleSegments: SubtitleSegment[] = clipSegments.map((seg) => {
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
export function formatSubtitleTime(seconds: number): string {
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
