"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subtitleRenderer = exports.SubtitleRenderer = void 0;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const assGenerator_1 = require("./assGenerator");
// #region agent log
const _dbglog = (loc, msg, data = {}, hyp = '') => {
    try {
        fs_1.default.appendFileSync(path_1.default.resolve(__dirname, '../../..', 'debug-0170bb.log'), JSON.stringify({ sessionId: '0170bb', location: loc, message: msg, data, timestamp: Date.now(), hypothesisId: hyp }) + '\n');
    }
    catch { }
};
// #endregion
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
 * Render video with burned-in subtitles using FFmpeg
 */
class SubtitleRenderer {
    constructor(finalStorageDir = './storage/final', tempDir = './storage/temp') {
        this.finalStorageDir = path_1.default.resolve(finalStorageDir);
        this.tempDir = path_1.default.resolve(tempDir);
        this.ensureDirectories();
    }
    ensureDirectories() {
        if (!fs_1.default.existsSync(this.finalStorageDir)) {
            fs_1.default.mkdirSync(this.finalStorageDir, { recursive: true });
        }
        if (!fs_1.default.existsSync(this.tempDir)) {
            fs_1.default.mkdirSync(this.tempDir, { recursive: true });
        }
    }
    /**
     * Render video with styled subtitles burned in.
     * If subtitleStyle is provided, it converts frontend style → ASS style.
     * If subtitles are empty or disabled, copies the video as-is.
     */
    async renderWithSubtitles(clipPath, subtitles, clipId, subtitleStyle, subtitleEnabled = true) {
        // Use timestamped filename to defeat browser caching permanently.
        // Every render produces a NEW URL path, so the browser is forced to fetch it.
        const version = Date.now();
        const outputFilename = `${clipId}_final_${version}.mp4`;
        const outputPath = path_1.default.join(this.finalStorageDir, outputFilename);
        // Clean up ALL old rendered versions of this clip (both legacy _final.mp4 and versioned _final_*.mp4)
        try {
            const oldFiles = fs_1.default.readdirSync(this.finalStorageDir)
                .filter(f => f.endsWith('.mp4') && f !== outputFilename && (f === `${clipId}_final.mp4` || // legacy static name
                (f.startsWith(`${clipId}_final_`) && f.endsWith('.mp4')) // versioned names
            ));
            for (const old of oldFiles) {
                fs_1.default.unlinkSync(path_1.default.join(this.finalStorageDir, old));
                console.log(`🧹 Deleted old render: ${old}`);
            }
        }
        catch { /* non-critical */ }
        // If subtitles disabled or empty → just copy the video
        if (!subtitleEnabled || !subtitles || subtitles.length === 0) {
            console.log(`🎬 Copying video without subtitles for ${clipId}...`);
            await runFFmpeg(['-i', clipPath, '-c', 'copy', '-y', outputPath]);
            if (!fs_1.default.existsSync(outputPath))
                throw new Error('Failed to copy video');
            console.log(`✅ Video copied: ${outputPath}`);
            return outputPath;
        }
        // Convert frontend style → ASS style (or use defaults)
        const assStyle = subtitleStyle ? (0, assGenerator_1.frontendStyleToASS)(subtitleStyle) : undefined;
        // Generate ASS subtitle file
        const assContent = (0, assGenerator_1.generateASS)(subtitles, assStyle);
        const assPath = path_1.default.join(this.tempDir, `${clipId}.ass`);
        fs_1.default.writeFileSync(assPath, assContent, 'utf-8');
        // Verify .ass file was created and is valid
        if (!fs_1.default.existsSync(assPath)) {
            throw new Error(`ASS subtitle file was not created at ${assPath}`);
        }
        const assFileSize = fs_1.default.statSync(assPath).size;
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
        const safeAssPath = path_1.default.relative(process.cwd(), assPath)
            .replace(/\\/g, '/');
        console.log(`🔧 INPUT:    ${clipPath}`);
        console.log(`🔧 SUBTITLE: ${assPath}`);
        console.log(`🔧 OUTPUT:   ${outputPath}`);
        console.log(`🔧 Relative filter path: ${safeAssPath}`);
        // #region agent log
        _dbglog('subtitleRenderer.ts:render', 'FFmpeg subtitle path', { cwd: process.cwd(), assPath, safeAssPath, clipPath, outputPath }, 'FFmpeg-path');
        // #endregion
        // Validate input video exists
        if (!fs_1.default.existsSync(clipPath)) {
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
            if (stderr)
                console.log(`🔧 FFmpeg stderr:\n${stderr.slice(-500)}`);
            const renderTime = ((Date.now() - startTime) / 1000).toFixed(1);
            // Clean up temp ASS file
            if (fs_1.default.existsSync(assPath))
                fs_1.default.unlinkSync(assPath);
            if (!fs_1.default.existsSync(outputPath))
                throw new Error('Final video was not created');
            console.log(`✅ Final video rendered in ${renderTime}s: ${outputPath}`);
            // #region agent log
            _dbglog('subtitleRenderer.ts:success', 'FFmpeg render SUCCESS', { renderTime, outputPath, fileSize: fs_1.default.existsSync(outputPath) ? fs_1.default.statSync(outputPath).size : 0 }, 'FFmpeg-path');
            // #endregion
            return outputPath;
        }
        catch (error) {
            // #region agent log
            _dbglog('subtitleRenderer.ts:fail', 'FFmpeg render FAILED', { error: error.message, stderr: error.stderr?.slice(-500) }, 'FFmpeg-path');
            // #endregion
            console.error('❌ FFmpeg subtitle rendering failed:', error.message);
            if (error.stderr)
                console.error('❌ FFmpeg stderr:', error.stderr.slice(-1000));
            if (fs_1.default.existsSync(assPath))
                fs_1.default.unlinkSync(assPath);
            // GRACEFUL FALLBACK: copy original video instead of crashing
            console.warn('⚠️ Falling back to original video without subtitles');
            try {
                await runFFmpeg(['-i', clipPath, '-c', 'copy', '-y', outputPath]);
                if (fs_1.default.existsSync(outputPath)) {
                    console.log(`✅ Fallback: copied original video to ${outputPath}`);
                    return outputPath;
                }
            }
            catch (fallbackError) {
                console.error('❌ Fallback copy also failed:', fallbackError.message);
            }
            throw new Error(`Failed to render video with subtitles: ${error.message}`);
        }
    }
    getFinalStorageDir() {
        return this.finalStorageDir;
    }
}
exports.SubtitleRenderer = SubtitleRenderer;
exports.subtitleRenderer = new SubtitleRenderer();
