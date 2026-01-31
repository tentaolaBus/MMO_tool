import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { SubtitleSegment } from '../models/subtitle';
import { generateASS } from './assGenerator';

const execAsync = promisify(exec);

/**
 * Render video with burned-in subtitles using FFmpeg
 */
export class SubtitleRenderer {
    private finalStorageDir: string;
    private tempDir: string;

    constructor(
        finalStorageDir: string = './storage/final',
        tempDir: string = './storage/temp'
    ) {
        this.finalStorageDir = path.resolve(finalStorageDir);
        this.tempDir = path.resolve(tempDir);
        this.ensureDirectories();
    }

    private ensureDirectories() {
        if (!fs.existsSync(this.finalStorageDir)) {
            fs.mkdirSync(this.finalStorageDir, { recursive: true });
        }
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Render video with hardcoded subtitles
     */
    async renderWithSubtitles(
        clipPath: string,
        subtitles: SubtitleSegment[],
        clipId: string
    ): Promise<string> {
        // Generate ASS subtitle file
        const assContent = generateASS(subtitles);
        const assPath = path.join(this.tempDir, `${clipId}.ass`);
        fs.writeFileSync(assPath, assContent, 'utf-8');

        // Output path
        const outputFilename = `${clipId}_final.mp4`;
        const outputPath = path.join(this.finalStorageDir, outputFilename);

        // FFmpeg command to burn subtitles
        // Using subtitles filter to overlay ASS file
        const ffmpegCmd = `ffmpeg -i "${clipPath}" ` +
            `-vf "subtitles='${assPath.replace(/\\/g, '/').replace(/:/g, '\\\\:')}'" ` +
            `-c:v libx264 ` +
            `-preset medium ` +
            `-crf 23 ` +
            `-c:a copy ` +
            `-y ` +
            `"${outputPath}"`;

        try {
            console.log(`Rendering final video with subtitles for ${clipId}...`);
            const startTime = Date.now();

            const { stdout, stderr } = await execAsync(ffmpegCmd, {
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer for long outputs
            });

            const renderTime = ((Date.now() - startTime) / 1000).toFixed(1);

            // Clean up temp ASS file
            if (fs.existsSync(assPath)) {
                fs.unlinkSync(assPath);
            }

            // Verify output
            if (!fs.existsSync(outputPath)) {
                throw new Error('Final video was not created');
            }

            console.log(`Final video rendered in ${renderTime}s: ${outputPath}`);
            return outputPath;

        } catch (error: any) {
            console.error('FFmpeg subtitle rendering failed:', error.message);

            // Clean up temp file on error
            if (fs.existsSync(assPath)) {
                fs.unlinkSync(assPath);
            }

            throw new Error(`Failed to render video with subtitles: ${error.message}`);
        }
    }

    /**
     * Get final storage directory
     */
    getFinalStorageDir(): string {
        return this.finalStorageDir;
    }
}

export const subtitleRenderer = new SubtitleRenderer();
