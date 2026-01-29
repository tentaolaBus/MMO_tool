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

        // Format timestamps for FFmpeg (HH:MM:SS.MS)
        const startTimeStr = this.formatTimestamp(startTime);
        const endTimeStr = this.formatTimestamp(endTime);

        // FFmpeg command
        // Using -c copy for speed (no re-encoding)
        // If accuracy is needed, switch to -c:v libx264 -c:a aac
        const ffmpegCmd = `ffmpeg -i "${videoPath}" ` +
            `-ss ${startTimeStr} ` +
            `-to ${endTimeStr} ` +
            `-c:v copy ` +
            `-c:a copy ` +
            `-y ` + // Overwrite if exists
            `"${clipPath}"`;

        try {
            console.log(`Cutting clip ${clipIndex}: ${startTimeStr} to ${endTimeStr}`);
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
