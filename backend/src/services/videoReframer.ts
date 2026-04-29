import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Supported output aspect ratios for reframing.
 */
export type OutputRatio = '9:16' | '1:1' | '4:5';

/**
 * Settings for the reframe operation.
 */
export interface ReframeSettings {
    /** Output aspect ratio (default: '9:16') */
    ratio: OutputRatio;
    /** Horizontal crop position as 0–1 fraction (0 = left, 0.5 = center, 1 = right) */
    cropX: number;
    /** Whether to use auto-center (ignores cropX, uses 0.5) */
    autoCenter: boolean;
}

/**
 * Video metadata extracted via ffprobe.
 */
export interface VideoMeta {
    width: number;
    height: number;
    duration: number;
    codec: string;
    fps: number;
}

/** Ratio dimensions lookup: [widthRatio, heightRatio, targetWidth, targetHeight] */
const RATIO_MAP: Record<OutputRatio, { w: number; h: number; targetW: number; targetH: number }> = {
    '9:16': { w: 9, h: 16, targetW: 1080, targetH: 1920 },
    '1:1':  { w: 1, h: 1,  targetW: 1080, targetH: 1080 },
    '4:5':  { w: 4, h: 5,  targetW: 1080, targetH: 1350 },
};

/**
 * Run an external command and capture output.
 */
function runCommand(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { windowsHide: true });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        proc.on('error', (err) => reject(err));

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                const error: any = new Error(`${cmd} exited with code ${code}`);
                error.stderr = stderr;
                reject(error);
            }
        });
    });
}

/**
 * VideoReframer — Converts horizontal videos to vertical format using FFmpeg.
 *
 * Supports center crop (default), manual X-offset adjustment,
 * and multiple output ratios (9:16, 1:1, 4:5).
 */
export class VideoReframer {
    private outputDir: string;

    constructor(outputDir: string = './storage/reframed') {
        this.outputDir = path.resolve(outputDir);
        this.ensureDirectory();
    }

    private ensureDirectory(): void {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Probe video file to get metadata (dimensions, duration, codec, fps).
     */
    async probeVideo(videoPath: string): Promise<VideoMeta> {
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Video file not found: ${videoPath}`);
        }

        const args = [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_streams',
            '-show_format',
            videoPath,
        ];

        const { stdout } = await runCommand('ffprobe', args);
        const data = JSON.parse(stdout);

        const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
        if (!videoStream) {
            throw new Error('No video stream found in file');
        }

        // Parse FPS from r_frame_rate (e.g. "30000/1001" or "30/1")
        let fps = 30;
        if (videoStream.r_frame_rate) {
            const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
            fps = den ? num / den : num;
        }

        return {
            width: videoStream.width,
            height: videoStream.height,
            duration: parseFloat(data.format?.duration || videoStream.duration || '0'),
            codec: videoStream.codec_name || 'unknown',
            fps: Math.round(fps * 100) / 100,
        };
    }

    /**
     * Validate that the video is suitable for reframing (horizontal or square).
     */
    validateForReframe(meta: VideoMeta): { valid: boolean; reason?: string } {
        if (meta.width < meta.height) {
            return {
                valid: false,
                reason: `Video is already vertical (${meta.width}×${meta.height}). Reframing is only needed for horizontal videos.`,
            };
        }

        if (meta.width < 360 || meta.height < 360) {
            return {
                valid: false,
                reason: `Video resolution too low (${meta.width}×${meta.height}). Minimum 360px on each side.`,
            };
        }

        return { valid: true };
    }

    /**
     * Build the FFmpeg crop filter string based on settings.
     *
     * For 9:16: crop width = height * 9/16, crop height = full height
     * The X offset is calculated from the cropX fraction (0–1).
     */
    buildCropFilter(meta: VideoMeta, settings: ReframeSettings): string {
        const ratioInfo = RATIO_MAP[settings.ratio];
        const { w: rw, h: rh, targetW, targetH } = ratioInfo;

        // Calculate crop dimensions (limited by source dimensions)
        // cropWidth = height * (rw/rh), but cannot exceed source width
        const cropHeight = meta.height;
        let cropWidth = Math.round(meta.height * (rw / rh));

        if (cropWidth > meta.width) {
            // Source is narrower than target ratio — crop vertically instead
            cropWidth = meta.width;
            // Adjusted crop height to match target ratio
            const adjustedCropHeight = Math.round(meta.width * (rh / rw));
            // Center vertically
            const yOffset = Math.round((meta.height - adjustedCropHeight) / 2);
            return `crop=${cropWidth}:${adjustedCropHeight}:0:${yOffset},scale=${targetW}:${targetH}`;
        }

        // Calculate X offset
        const maxOffset = meta.width - cropWidth;
        let xOffset: number;

        if (settings.autoCenter) {
            xOffset = Math.round(maxOffset / 2);
        } else {
            // cropX is 0–1 fraction: 0=left, 0.5=center, 1=right
            xOffset = Math.round(maxOffset * Math.max(0, Math.min(1, settings.cropX)));
        }

        return `crop=${cropWidth}:${cropHeight}:${xOffset}:0,scale=${targetW}:${targetH}`;
    }

    /**
     * Reframe a video from horizontal to vertical format.
     *
     * @param inputPath  - Path to source video
     * @param jobId      - Unique job identifier
     * @param settings   - Reframe settings (ratio, crop position, auto-center)
     * @param onProgress - Progress callback (0–100)
     * @returns Path to the reframed output video
     */
    async reframe(
        inputPath: string,
        jobId: string,
        settings: ReframeSettings,
        onProgress?: (percent: number) => void
    ): Promise<string> {
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Input video not found: ${inputPath}`);
        }

        this.ensureDirectory();

        // Probe video
        onProgress?.(5);
        const meta = await this.probeVideo(inputPath);
        console.log(`📐 Video dimensions: ${meta.width}×${meta.height}, duration: ${meta.duration}s`);

        // Validate
        const validation = this.validateForReframe(meta);
        if (!validation.valid) {
            throw new Error(validation.reason);
        }

        onProgress?.(10);

        // Build filter
        const cropFilter = this.buildCropFilter(meta, settings);
        const ratioInfo = RATIO_MAP[settings.ratio];
        const outputFilename = `reframed_${jobId}.mp4`;
        const outputPath = path.join(this.outputDir, outputFilename);

        console.log(`🎬 Reframing: ${meta.width}×${meta.height} → ${ratioInfo.targetW}×${ratioInfo.targetH}`);
        console.log(`📋 Crop filter: ${cropFilter}`);

        // Build FFmpeg args
        const ffmpegArgs = [
            '-i', inputPath,
            '-vf', cropFilter,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '18',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-y',
            outputPath,
        ];

        // Run FFmpeg with progress tracking
        onProgress?.(15);

        await new Promise<void>((resolve, reject) => {
            const proc = spawn('ffmpeg', ffmpegArgs, { windowsHide: true });

            let stderr = '';

            proc.stderr.on('data', (chunk: Buffer) => {
                stderr += chunk.toString();
                // Parse FFmpeg progress from stderr
                const timeMatch = stderr.match(/time=(\d+):(\d+):(\d+)\.(\d+)/g);
                if (timeMatch && meta.duration > 0) {
                    const lastTime = timeMatch[timeMatch.length - 1];
                    const parts = lastTime.replace('time=', '').split(/[:.]/).map(Number);
                    const currentSec = parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / 100;
                    const percent = Math.min(95, Math.round(15 + (currentSec / meta.duration) * 80));
                    onProgress?.(percent);
                }
            });

            proc.on('error', (err) => reject(err));

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    const error: any = new Error(`FFmpeg exited with code ${code}`);
                    error.stderr = stderr.slice(-500);
                    reject(error);
                }
            });
        });

        // Verify output
        if (!fs.existsSync(outputPath)) {
            throw new Error('Reframed video was not created');
        }

        const outputSize = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
        console.log(`✅ Reframed video created: ${outputPath} (${outputSize} MB)`);

        onProgress?.(100);
        return outputPath;
    }

    /**
     * Get output directory path.
     */
    getOutputDir(): string {
        return this.outputDir;
    }

    /**
     * Get the output path for a given job.
     */
    getOutputPath(jobId: string): string {
        return path.join(this.outputDir, `reframed_${jobId}.mp4`);
    }

    /**
     * Clean up a reframed output file.
     */
    cleanup(jobId: string): void {
        const outputPath = this.getOutputPath(jobId);
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
            console.log(`🗑️  Cleaned up reframed file: ${outputPath}`);
        }
    }
}

export const videoReframer = new VideoReframer();
