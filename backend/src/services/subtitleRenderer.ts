import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { SubtitleSegment } from '../models/subtitle';
import { generateASS, FrontendSubtitleStyle, frontendStyleToASS } from './assGenerator';

// #region agent log
const _dbglog = (loc: string, msg: string, data: any = {}, hyp: string = '') => {
    try { fs.appendFileSync(path.resolve(__dirname, '../../..', 'debug-0170bb.log'), JSON.stringify({sessionId:'0170bb',location:loc,message:msg,data,timestamp:Date.now(),hypothesisId:hyp}) + '\n'); } catch {}
};
// #endregion

/**
 * Run FFmpeg via spawn() and return a Promise.
 * Using spawn avoids all shell-escaping issues with Windows paths.
 */
function runFFmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', args, { windowsHide: true });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        proc.on('error', (err) => reject(err));

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                const error: any = new Error(`FFmpeg exited with code ${code}`);
                error.stderr = stderr;
                reject(error);
            }
        });
    });
}

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
     * Render video with styled subtitles burned in.
     * If subtitleStyle is provided, it converts frontend style → ASS style.
     * If subtitles are empty or disabled, copies the video as-is.
     */
    async renderWithSubtitles(
        clipPath: string,
        subtitles: SubtitleSegment[],
        clipId: string,
        subtitleStyle?: FrontendSubtitleStyle,
        subtitleEnabled: boolean = true
    ): Promise<string> {
        // Use timestamped filename to defeat browser caching permanently.
        // Every render produces a NEW URL path, so the browser is forced to fetch it.
        const version = Date.now();
        const outputFilename = `${clipId}_final_${version}.mp4`;
        const outputPath = path.join(this.finalStorageDir, outputFilename);

        // Clean up ALL old rendered versions of this clip (both legacy _final.mp4 and versioned _final_*.mp4)
        try {
            const oldFiles = fs.readdirSync(this.finalStorageDir)
                .filter(f => f.endsWith('.mp4') && f !== outputFilename && (
                    f === `${clipId}_final.mp4` ||                       // legacy static name
                    (f.startsWith(`${clipId}_final_`) && f.endsWith('.mp4'))  // versioned names
                ));
            for (const old of oldFiles) {
                fs.unlinkSync(path.join(this.finalStorageDir, old));
                console.log(`🧹 Deleted old render: ${old}`);
            }
        } catch { /* non-critical */ }

        // If subtitles disabled or empty → just copy the video
        if (!subtitleEnabled || !subtitles || subtitles.length === 0) {
            console.log(`🎬 Copying video without subtitles for ${clipId}...`);
            await runFFmpeg(['-i', clipPath, '-c', 'copy', '-y', outputPath]);
            if (!fs.existsSync(outputPath)) throw new Error('Failed to copy video');
            console.log(`✅ Video copied: ${outputPath}`);
            return outputPath;
        }

        // Convert frontend style → ASS style (or use defaults)
        const assStyle = subtitleStyle ? frontendStyleToASS(subtitleStyle) : undefined;

        // Generate ASS subtitle file
        const assContent = generateASS(subtitles, assStyle);
        const assPath = path.join(this.tempDir, `${clipId}.ass`);
        fs.writeFileSync(assPath, assContent, 'utf-8');

        // Verify .ass file was created and is valid
        if (!fs.existsSync(assPath)) {
            throw new Error(`ASS subtitle file was not created at ${assPath}`);
        }
        const assFileSize = fs.statSync(assPath).size;
        console.log(`📝 ASS file written: ${assPath} (${assFileSize} bytes)`);

        // Validate ASS content has required sections
        if (assFileSize === 0) {
            console.error('❌ ASS file is empty — skipping subtitle burn');
            await runFFmpeg(['-i', clipPath, '-c', 'copy', '-y', outputPath]);
            return outputPath;
        }
        if (!assContent.includes('[Script Info]') || !assContent.includes('[Events]')) {
            console.error('❌ ASS file missing required sections — skipping subtitle burn');
            await runFFmpeg(['-i', clipPath, '-c', 'copy', '-y', outputPath]);
            return outputPath;
        }

        // FFmpeg's subtitles filter can't handle Windows drive-letter colons
        // even with \: escaping. Use a path relative to CWD to avoid colons entirely.
        const safeAssPath = path.relative(process.cwd(), assPath)
            .replace(/\\/g, '/');

        console.log(`🔧 INPUT:    ${clipPath}`);
        console.log(`🔧 SUBTITLE: ${assPath}`);
        console.log(`🔧 OUTPUT:   ${outputPath}`);
        console.log(`🔧 Relative filter path: ${safeAssPath}`);
        // #region agent log
        _dbglog('subtitleRenderer.ts:render', 'FFmpeg subtitle path', {cwd: process.cwd(), assPath, safeAssPath, clipPath, outputPath}, 'FFmpeg-path');
        // #endregion

        // Validate input video exists
        if (!fs.existsSync(clipPath)) {
            throw new Error(`Input video not found: ${clipPath}`);
        }

        const ffmpegArgs = [
            '-i', clipPath,
            '-vf', `subtitles=${safeAssPath}`,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-c:a', 'copy',
            '-y',
            outputPath
        ];

        try {
            console.log(`🎬 Rendering final video with styled subtitles for ${clipId}...`);
            console.log(`📋 FFmpeg args:`, ffmpegArgs.join(' '));
            const startTime = Date.now();

            const { stderr } = await runFFmpeg(ffmpegArgs);
            if (stderr) console.log(`🔧 FFmpeg stderr:\n${stderr.slice(-500)}`);

            const renderTime = ((Date.now() - startTime) / 1000).toFixed(1);

            // Clean up temp ASS file
            if (fs.existsSync(assPath)) fs.unlinkSync(assPath);

            if (!fs.existsSync(outputPath)) throw new Error('Final video was not created');

            console.log(`✅ Final video rendered in ${renderTime}s: ${outputPath}`);
            // #region agent log
            _dbglog('subtitleRenderer.ts:success', 'FFmpeg render SUCCESS', {renderTime, outputPath, fileSize: fs.existsSync(outputPath)?fs.statSync(outputPath).size:0}, 'FFmpeg-path');
            // #endregion
            return outputPath;

        } catch (error: any) {
            // #region agent log
            _dbglog('subtitleRenderer.ts:fail', 'FFmpeg render FAILED', {error: error.message, stderr: error.stderr?.slice(-500)}, 'FFmpeg-path');
            // #endregion
            console.error('❌ FFmpeg subtitle rendering failed:', error.message);
            if (error.stderr) console.error('❌ FFmpeg stderr:', error.stderr.slice(-1000));
            if (fs.existsSync(assPath)) fs.unlinkSync(assPath);

            // GRACEFUL FALLBACK: copy original video instead of crashing
            console.warn('⚠️ Falling back to original video without subtitles');
            try {
                await runFFmpeg(['-i', clipPath, '-c', 'copy', '-y', outputPath]);
                if (fs.existsSync(outputPath)) {
                    console.log(`✅ Fallback: copied original video to ${outputPath}`);
                    return outputPath;
                }
            } catch (fallbackError: any) {
                console.error('❌ Fallback copy also failed:', fallbackError.message);
            }

            throw new Error(`Failed to render video with subtitles: ${error.message}`);
        }
    }

    getFinalStorageDir(): string {
        return this.finalStorageDir;
    }
}

export const subtitleRenderer = new SubtitleRenderer();
