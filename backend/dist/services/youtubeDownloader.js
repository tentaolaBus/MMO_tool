"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.youtubeDownloader = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * YouTube Downloader Service using yt-dlp
 */
class YouTubeDownloaderService {
    constructor() {
        this.downloadDir = path_1.default.resolve('./storage/youtube');
        this.ensureDirectory();
    }
    /**
     * Ensure download directory exists
     */
    ensureDirectory() {
        if (!fs_1.default.existsSync(this.downloadDir)) {
            fs_1.default.mkdirSync(this.downloadDir, { recursive: true });
        }
    }
    /**
     * Validate YouTube URL format
     */
    validateYoutubeUrl(url) {
        const patterns = [
            /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
            /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]+/,
            /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/,
        ];
        return patterns.some(pattern => pattern.test(url));
    }
    /**
     * Get video information without downloading
     */
    async getVideoInfo(url) {
        if (!this.validateYoutubeUrl(url)) {
            throw new Error('Invalid YouTube URL');
        }
        try {
            const cmd = `yt-dlp --dump-json --no-download "${url}"`;
            const { stdout } = await execAsync(cmd);
            const info = JSON.parse(stdout);
            return {
                title: info.title || 'Unknown',
                duration: info.duration || 0,
                uploader: info.uploader || 'Unknown',
                thumbnail: info.thumbnail || '',
            };
        }
        catch (error) {
            console.error('❌ Failed to get video info:', error.message);
            throw new Error(`Failed to get video info: ${error.message}`);
        }
    }
    /**
     * Download video from YouTube
     * @param youtubeUrl - YouTube video URL
     * @param jobId - Job ID for filename
     * @returns Path to downloaded video file
     */
    async downloadVideo(youtubeUrl, jobId) {
        if (!this.validateYoutubeUrl(youtubeUrl)) {
            throw new Error('Invalid YouTube URL');
        }
        const outputPath = path_1.default.join(this.downloadDir, `${jobId}.mp4`);
        console.log(`📥 Downloading YouTube video to: ${outputPath}`);
        try {
            // yt-dlp command with optimal settings for processing
            // -f best[ext=mp4] - prefer mp4 format
            // --merge-output-format mp4 - ensure output is mp4
            // -o output path
            const cmd = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" ` +
                `--merge-output-format mp4 ` +
                `--no-playlist ` +
                `--no-check-certificate ` +
                `-o "${outputPath}" ` +
                `"${youtubeUrl}"`;
            console.log(`Running: ${cmd}`);
            const { stdout, stderr } = await execAsync(cmd, {
                timeout: 600000, // 10 minute timeout
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });
            if (stderr && !stderr.includes('WARNING')) {
                console.log('yt-dlp output:', stderr);
            }
            // Verify file was created
            if (!fs_1.default.existsSync(outputPath)) {
                throw new Error('Downloaded file not found');
            }
            const stats = fs_1.default.statSync(outputPath);
            console.log(`✅ Downloaded: ${path_1.default.basename(outputPath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            return outputPath;
        }
        catch (error) {
            console.error('❌ YouTube download failed:', error.message);
            // Clean up partial download
            if (fs_1.default.existsSync(outputPath)) {
                fs_1.default.unlinkSync(outputPath);
            }
            throw new Error(`YouTube download failed: ${error.message}`);
        }
    }
    /**
     * Delete downloaded video (cleanup after processing)
     */
    deleteVideo(videoPath) {
        try {
            if (fs_1.default.existsSync(videoPath)) {
                fs_1.default.unlinkSync(videoPath);
                console.log(`🗑️ Deleted YouTube source: ${path_1.default.basename(videoPath)}`);
            }
        }
        catch (error) {
            console.error(`⚠️ Failed to delete ${videoPath}:`, error.message);
        }
    }
    /**
     * Check if yt-dlp is installed
     */
    async checkInstallation() {
        try {
            await execAsync('yt-dlp --version');
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.youtubeDownloader = new YouTubeDownloaderService();
