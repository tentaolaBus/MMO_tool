import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

export interface VideoInfo {
    title: string;
    duration: number;
    uploader: string;
    thumbnail: string;
}

/**
 * YouTube Downloader Service using yt-dlp
 */
class YouTubeDownloaderService {
    private downloadDir: string;

    constructor() {
        this.downloadDir = path.resolve('./storage/youtube');
        this.ensureDirectory();
    }

    /**
     * Ensure download directory exists
     */
    private ensureDirectory() {
        if (!fs.existsSync(this.downloadDir)) {
            fs.mkdirSync(this.downloadDir, { recursive: true });
        }
    }

    /**
     * Validate YouTube URL format
     */
    validateYoutubeUrl(url: string): boolean {
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
    async getVideoInfo(url: string): Promise<VideoInfo> {
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
        } catch (error: any) {
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
    async downloadVideo(youtubeUrl: string, jobId: string): Promise<string> {
        if (!this.validateYoutubeUrl(youtubeUrl)) {
            throw new Error('Invalid YouTube URL');
        }

        const outputPath = path.join(this.downloadDir, `${jobId}.mp4`);

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
            if (!fs.existsSync(outputPath)) {
                throw new Error('Downloaded file not found');
            }

            const stats = fs.statSync(outputPath);
            console.log(`✅ Downloaded: ${path.basename(outputPath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

            return outputPath;
        } catch (error: any) {
            console.error('❌ YouTube download failed:', error.message);

            // Clean up partial download
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }

            throw new Error(`YouTube download failed: ${error.message}`);
        }
    }

    /**
     * Delete downloaded video (cleanup after processing)
     */
    deleteVideo(videoPath: string): void {
        try {
            if (fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
                console.log(`🗑️ Deleted YouTube source: ${path.basename(videoPath)}`);
            }
        } catch (error: any) {
            console.error(`⚠️ Failed to delete ${videoPath}:`, error.message);
        }
    }

    /**
     * Check if yt-dlp is installed
     */
    async checkInstallation(): Promise<boolean> {
        try {
            await execAsync('yt-dlp --version');
            return true;
        } catch {
            return false;
        }
    }
}

export const youtubeDownloader = new YouTubeDownloaderService();
