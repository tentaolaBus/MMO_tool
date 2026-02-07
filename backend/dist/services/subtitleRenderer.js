"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subtitleRenderer = exports.SubtitleRenderer = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const assGenerator_1 = require("./assGenerator");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
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
     * Render video with hardcoded subtitles
     */
    async renderWithSubtitles(clipPath, subtitles, clipId) {
        // Generate ASS subtitle file
        const assContent = (0, assGenerator_1.generateASS)(subtitles);
        const assPath = path_1.default.join(this.tempDir, `${clipId}.ass`);
        fs_1.default.writeFileSync(assPath, assContent, 'utf-8');
        // Output path
        const outputFilename = `${clipId}_final.mp4`;
        const outputPath = path_1.default.join(this.finalStorageDir, outputFilename);
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
            if (fs_1.default.existsSync(assPath)) {
                fs_1.default.unlinkSync(assPath);
            }
            // Verify output
            if (!fs_1.default.existsSync(outputPath)) {
                throw new Error('Final video was not created');
            }
            console.log(`Final video rendered in ${renderTime}s: ${outputPath}`);
            return outputPath;
        }
        catch (error) {
            console.error('FFmpeg subtitle rendering failed:', error.message);
            // Clean up temp file on error
            if (fs_1.default.existsSync(assPath)) {
                fs_1.default.unlinkSync(assPath);
            }
            throw new Error(`Failed to render video with subtitles: ${error.message}`);
        }
    }
    /**
     * Get final storage directory
     */
    getFinalStorageDir() {
        return this.finalStorageDir;
    }
}
exports.SubtitleRenderer = SubtitleRenderer;
exports.subtitleRenderer = new SubtitleRenderer();
