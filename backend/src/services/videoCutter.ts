import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

/**
 * VideoCutter - Cuts video clips using FFmpeg
 */
export class VideoCutter {
    private clipStorageDir: string;

    constructor(storageDir: string = './storage/clips') {
        this.clipStorageDir = path.resolve(storageDir);
        this.ensureClipDirectory();
    }

    /**
     * Ensure clip storage directory exists
     */
    private ensureClipDirectory() {
        if (!fs.existsSync(this.clipStorageDir)) {
            fs.mkdirSync(this.clipStorageDir, { recursive: true });
        }
    }

    /**
     * Cut a single clip from a video
     * 
     * @param videoPath - Path to source video
     * @param startTime - Start time in seconds
     * @param endTime - End time in seconds
     * @param jobId - Original job ID
     * @param clipIndex - Index of this clip
     * @returns Path to generated clip file
     */
    async cutClip(
        videoPath: string,
        startTime: number,
        endTime: number,
        jobId: string,
        clipIndex: number
    ): Promise<string> {
        // Generate clip filename
        const clipId = uuidv4();
        const clipFilename = `clip_${jobId}_${clipIndex}.mp4`;
        const clipPath = path.join(this.clipStorageDir, clipFilename);

        // Calculate duration
        const duration = endTime - startTime;

        // Format timestamps for FFmpeg (HH:MM:SS.MS)
        const startTimeStr = this.formatTimestamp(startTime);
        const durationStr = this.formatTimestamp(duration);

        // FFmpeg command with accurate cutting and 9:16 vertical output
        // Center-crop to 9:16 aspect ratio, then scale to 720x1280
        // Filter explanation:
        // - crop='ih*9/16:ih:(iw-ih*9/16)/2:0' = crop width to 9:16 ratio, centered horizontally
        // - scale=720:1280 = scale to final 720x1280 resolution
        const ffmpegCmd = `ffmpeg -ss ${startTimeStr} ` +
            `-i "${videoPath}" ` +
            `-t ${durationStr} ` +
            `-vf "crop='min(iw,ih*9/16):min(ih,iw*16/9):(iw-min(iw,ih*9/16))/2:(ih-min(ih,iw*16/9))/2',scale=720:1280" ` +
            `-c:v libx264 ` +
            `-preset veryfast ` +  // Very fast encoding
            `-crf 23 ` +
            `-c:a aac ` +
            `-b:a 128k ` +
            `-avoid_negative_ts make_zero ` + // Fix timestamp issues
            `-y ` +
            `"${clipPath}"`;

        try {
            console.log(`Cutting clip ${clipIndex}: ${startTimeStr} duration ${durationStr}`);
            const { stdout, stderr } = await execAsync(ffmpegCmd);

            // FFmpeg writes progress to stderr, not an error
            if (stderr && !stderr.includes('error')) {
                console.log(`FFmpeg output: ${stderr.substring(0, 200)}...`);
            }

            // Verify file was created
            if (!fs.existsSync(clipPath)) {
                throw new Error('Clip file was not created');
            }

            console.log(`Clip ${clipIndex} created: ${clipPath}`);
            return clipPath;

        } catch (error: any) {
            console.error(`Failed to cut clip ${clipIndex}:`, error.message);
            throw new Error(`FFmpeg clip cutting failed: ${error.message}`);
        }
    }

    /**
     * Cut multiple clips from a video
     */
    async cutMultipleClips(
        videoPath: string,
        clips: Array<{ startTime: number; endTime: number }>,
        jobId: string
    ): Promise<string[]> {
        const clipPaths: string[] = [];

        for (let i = 0; i < clips.length; i++) {
            const { startTime, endTime } = clips[i];
            const clipPath = await this.cutClip(videoPath, startTime, endTime, jobId, i);
            clipPaths.push(clipPath);
        }

        return clipPaths;
    }

    /**
     * Format seconds to HH:MM:SS.MS format for FFmpeg
     */
    private formatTimestamp(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 1000);

        return `${String(hours).padStart(2, '0')}:` +
            `${String(minutes).padStart(2, '0')}:` +
            `${String(secs).padStart(2, '0')}.` +
            `${String(ms).padStart(3, '0')}`;
    }

    /**
     * Get clip storage directory path
     */
    getClipStorageDir(): string {
        return this.clipStorageDir;
    }
}

export const videoCutter = new VideoCutter();
