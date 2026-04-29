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
     * @param maxDurationSec - Maximum allowed duration (0 = no limit)
     * @returns Path to downloaded video file
     */
    async downloadVideo(youtubeUrl: string, jobId: string, maxDurationSec: number = 0): Promise<string> {
        if (!this.validateYoutubeUrl(youtubeUrl)) {
            throw new Error('Invalid YouTube URL');
        }

        // Duration check — get info first if we have a limit
        if (maxDurationSec > 0) {
            try {
                const info = await this.getVideoInfo(youtubeUrl);
                if (info.duration > maxDurationSec) {
                    const maxMin = Math.round(maxDurationSec / 60);
                    const vidMin = Math.round(info.duration / 60);
                    throw new Error(`Video too long (${vidMin} min). Maximum allowed: ${maxMin} min.`);
                }
                console.log(`   [PIPELINE] YouTube video validated: "${info.title}" (${info.duration}s)`);
            } catch (e: any) {
                if (e.message.includes('too long')) throw e;
                console.warn(`   [PIPELINE] ⚠️ Could not validate duration: ${e.message}`);
            }
        }

        const outputPath = path.join(this.downloadDir, `${jobId}.mp4`);

        console.log(`   [PIPELINE] 📥 Downloading YouTube video to: ${outputPath}`);

        // ── Format fallback chain ────────────────────────────────────────
        // Strategy 1: Best mp4 video + m4a audio merged to mp4 (ideal)
        // Strategy 2: Best quality, let yt-dlp pick format and re-encode to mp4
        // Strategy 3: Absolute fallback — any available format, re-encoded
        const formatStrategies = [
            {
                name: 'mp4+m4a merge',
                format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo+bestaudio',
            },
            {
                name: 'best quality + re-encode',
                format: 'bestvideo+bestaudio/best',
            },
            {
                name: 'any available format',
                format: 'best',
            },
        ];

        let lastError: Error | null = null;

        for (let attempt = 0; attempt < formatStrategies.length; attempt++) {
            const strategy = formatStrategies[attempt];
            console.log(`\n🔄 [yt-dlp] Attempt ${attempt + 1}/${formatStrategies.length}: ${strategy.name}`);

            try {
                await this.runYtDlp(youtubeUrl, outputPath, strategy.format);

                // Verify file was created
                if (!fs.existsSync(outputPath)) {
                    throw new Error('Downloaded file not found after yt-dlp completed');
                }

                const stats = fs.statSync(outputPath);
                if (stats.size === 0) {
                    fs.unlinkSync(outputPath);
                    throw new Error('Downloaded file is empty (0 bytes)');
                }

                console.log(`✅ Downloaded: ${path.basename(outputPath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB) using strategy: ${strategy.name}`);
                return outputPath;
            } catch (err: any) {
                lastError = err;
                console.error(`❌ [yt-dlp] Strategy "${strategy.name}" failed: ${err.message}`);

                // Clean up partial download before retry
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath);
                }

                // Don't retry on non-format errors (e.g., video is private, network down)
                const msg = err.message || '';
                if (msg.includes('Private video') || msg.includes('Video unavailable') ||
                    msg.includes('Sign in') || msg.includes('confirm your age')) {
                    console.error('🚫 [yt-dlp] Video access error — not retrying');
                    break;
                }
            }
        }

        // All strategies failed — throw structured error
        const errMsg = lastError?.message || 'Unknown error';

        // Detect specific error categories for better frontend messages
        if (errMsg.includes('Sign in') || errMsg.includes('bot') || errMsg.includes('confirm')) {
            console.error('🤖 YouTube bot detection triggered! Try:');
            console.error('   1. Update yt-dlp: pip install -U yt-dlp');
            console.error('   2. Use cookies: yt-dlp --cookies-from-browser chrome');
            console.error('   3. Export cookies.txt from browser and use --cookies cookies.txt');
        }

        throw new Error(`YouTube download failed after ${formatStrategies.length} format strategies: ${errMsg}`);
    }

    /**
     * Run yt-dlp with spawn for proper output capture
     */
    private runYtDlp(url: string, outputPath: string, format: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');

            const args = [
                '-f', format,
                '--merge-output-format', 'mp4',
                '--no-playlist',
                '--no-check-certificate',
                '--extractor-args', 'youtube:player_client=web,default',
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                '--no-warnings',
                '--newline',
                '-o', outputPath,
                url,
            ];

            console.log(`[yt-dlp] spawn: yt-dlp ${args.join(' ')}`);

            const proc = spawn('yt-dlp', args, {
                windowsHide: true,
                timeout: 600000, // 10 min
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data: Buffer) => {
                const line = data.toString();
                stdout += line;
                // Log download progress in real time
                if (line.includes('[download]')) {
                    process.stdout.write(`   ${line.trim()}\r`);
                }
            });

            proc.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            proc.on('close', (code: number | null) => {
                console.log(`\n[yt-dlp] Exit code: ${code}`);
                if (stdout) console.log(`[yt-dlp] stdout (last 500): ${stdout.slice(-500)}`);
                if (stderr) console.error(`[yt-dlp] stderr: ${stderr}`);
                console.log(`[yt-dlp] Output file exists: ${fs.existsSync(outputPath)}`);

                if (code !== 0) {
                    reject(new Error(stderr || `yt-dlp exited with code ${code}`));
                } else {
                    resolve();
                }
            });

            proc.on('error', (err: Error) => {
                console.error(`[yt-dlp] spawn error: ${err.message}`);
                reject(new Error(`Failed to start yt-dlp: ${err.message}`));
            });
        });
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
