"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoCutter = exports.VideoCutter = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
/**
 * Run FFmpeg via spawn() and return a Promise.
 * Using spawn avoids all shell-escaping issues with Windows paths.
 */
function runFFmpeg(args) {
    return new Promise((resolve, reject) => {
        const proc = (0, child_process_1.spawn)('ffmpeg', args, { windowsHide: true });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        proc.on('error', (err) => reject(err));
        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            }
            else {
                const error = new Error(`FFmpeg exited with code ${code}`);
                error.stderr = stderr;
                reject(error);
            }
        });
    });
}
/**
 * VideoCutter - Cuts video clips using FFmpeg
 */
class VideoCutter {
    constructor(storageDir = './storage/clips') {
        this.clipStorageDir = path_1.default.resolve(storageDir);
        this.ensureClipDirectory();
    }
    /**
     * Ensure clip storage directory exists
     */
    ensureClipDirectory() {
        if (!fs_1.default.existsSync(this.clipStorageDir)) {
            fs_1.default.mkdirSync(this.clipStorageDir, { recursive: true });
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
    async cutClip(videoPath, startTime, endTime, jobId, clipIndex) {
        // Validate input file exists
        if (!fs_1.default.existsSync(videoPath)) {
            throw new Error(`Input video file not found: ${videoPath}`);
        }
        // Ensure output directory exists
        this.ensureClipDirectory();
        // Generate clip filename
        const clipFilename = `clip_${jobId}_${clipIndex}.mp4`;
        const clipPath = path_1.default.join(this.clipStorageDir, clipFilename);
        // Calculate duration
        const duration = endTime - startTime;
        // Format timestamps for FFmpeg (HH:MM:SS.MS)
        const startTimeStr = this.formatTimestamp(startTime);
        const durationStr = this.formatTimestamp(duration);
        // Build FFmpeg args as array (avoids all shell escaping issues)
        const ffmpegArgs = [
            '-ss', startTimeStr,
            '-i', videoPath,
            '-t', durationStr,
            '-vf', "crop='min(iw,ih*9/16):min(ih,iw*16/9):(iw-min(iw,ih*9/16))/2:(ih-min(ih,iw*16/9))/2',scale=720:1280",
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-avoid_negative_ts', 'make_zero',
            '-y',
            clipPath
        ];
        try {
            console.log(`🎬 Cutting clip ${clipIndex}: ${startTimeStr} duration ${durationStr}`);
            console.log(`📋 FFmpeg args:`, ffmpegArgs.join(' '));
            const { stderr } = await runFFmpeg(ffmpegArgs);
            // FFmpeg writes progress to stderr, not an error
            if (stderr) {
                console.log(`🔧 FFmpeg stderr (last 300 chars): ${stderr.slice(-300)}`);
            }
            // Verify file was created
            if (!fs_1.default.existsSync(clipPath)) {
                throw new Error('Clip file was not created');
            }
            const fileSizeKB = (fs_1.default.statSync(clipPath).size / 1024).toFixed(0);
            console.log(`✅ Clip ${clipIndex} created: ${clipPath} (${fileSizeKB} KB)`);
            return clipPath;
        }
        catch (error) {
            console.error(`❌ Failed to cut clip ${clipIndex}:`, error.message);
            if (error.stderr) {
                console.error(`❌ FFmpeg stderr:`, error.stderr.slice(-500));
            }
            throw new Error(`FFmpeg clip cutting failed for clip ${clipIndex}: ${error.message}`);
        }
    }
    /**
     * Cut multiple clips from a video
     */
    async cutMultipleClips(videoPath, clips, jobId) {
        const clipPaths = [];
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
    formatTimestamp(seconds) {
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
    getClipStorageDir() {
        return this.clipStorageDir;
    }
}
exports.VideoCutter = VideoCutter;
exports.videoCutter = new VideoCutter();
