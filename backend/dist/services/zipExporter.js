"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.zipExporter = void 0;
const archiver_1 = __importDefault(require("archiver"));
const stream_1 = require("stream");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * ZIP Export Service for streaming clip archives
 */
class ZipExporterService {
    /**
     * Create a ZIP stream containing multiple clip files
     * @param clipPaths - Array of paths to clip files
     * @returns ReadableStream of the ZIP archive
     */
    createZipStream(clipPaths) {
        const archive = (0, archiver_1.default)('zip', {
            zlib: { level: 5 } // Balance between speed and compression
        });
        const passThrough = new stream_1.PassThrough();
        // Pipe archive to passthrough stream
        archive.pipe(passThrough);
        // Add error handling
        archive.on('error', (err) => {
            console.error('ZIP archive error:', err);
            passThrough.destroy(err);
        });
        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') {
                console.warn('ZIP warning (file not found):', err);
            }
            else {
                console.warn('ZIP warning:', err);
            }
        });
        // Add each clip file to the archive
        for (const clipPath of clipPaths) {
            if (fs_1.default.existsSync(clipPath)) {
                const filename = path_1.default.basename(clipPath);
                archive.file(clipPath, { name: filename });
                console.log(`📦 Added to ZIP: ${filename}`);
            }
            else {
                console.warn(`⚠️ Clip file not found, skipping: ${clipPath}`);
            }
        }
        // Finalize the archive (this starts streaming)
        archive.finalize();
        return passThrough;
    }
    /**
     * Calculate total size of files to be zipped
     * @param clipPaths - Array of paths to clip files
     * @returns Total size in bytes
     */
    calculateTotalSize(clipPaths) {
        let totalSize = 0;
        for (const clipPath of clipPaths) {
            if (fs_1.default.existsSync(clipPath)) {
                const stats = fs_1.default.statSync(clipPath);
                totalSize += stats.size;
            }
        }
        return totalSize;
    }
    /**
     * Generate a filename for the ZIP download
     * @param jobId - Job ID for naming
     * @param clipCount - Number of clips
     * @returns Filename string
     */
    generateZipFilename(jobId, clipCount) {
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return `clips_${jobId.slice(0, 8)}_${clipCount}clips_${timestamp}.zip`;
    }
}
exports.zipExporter = new ZipExporterService();
