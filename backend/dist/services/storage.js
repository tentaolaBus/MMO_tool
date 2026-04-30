"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
/**
 * Simple file storage service
 * Handles local file system operations
 * Can be easily replaced with S3 later
 */
class StorageService {
    constructor() {
        this.ensureDirectories();
    }
    /**
     * Ensure all required storage directories exist
     */
    ensureDirectories() {
        const dirs = [
            path_1.default.resolve(config_1.config.uploadDir),
            path_1.default.resolve(config_1.config.storageDir),
            path_1.default.resolve(config_1.config.storageDir, 'videos'),
            path_1.default.resolve(config_1.config.storageDir, 'audio'),
            path_1.default.resolve(config_1.config.storageDir, 'transcripts'),
            path_1.default.resolve(config_1.config.storageDir, 'reframed'),
        ];
        dirs.forEach(dir => {
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
        });
    }
    /**
     * Move uploaded file to permanent storage
     */
    moveToStorage(sourcePath, destinationPath) {
        fs_1.default.renameSync(sourcePath, destinationPath);
    }
    /**
     * Get full path for video storage
     */
    getVideoPath(jobId, extension = 'mp4') {
        return path_1.default.resolve(config_1.config.storageDir, 'videos', `${jobId}.${extension}`);
    }
    /**
     * Get full path for audio storage
     */
    getAudioPath(jobId) {
        return path_1.default.resolve(config_1.config.storageDir, 'audio', `${jobId}.mp3`);
    }
    /**
     * Get full path for transcript storage
     */
    getTranscriptPath(jobId) {
        return path_1.default.resolve(config_1.config.storageDir, 'transcripts', `${jobId}.json`);
    }
    /**
     * Get full path for reframed video storage
     */
    getReframePath(jobId) {
        return path_1.default.resolve(config_1.config.storageDir, 'reframed', `reframed_${jobId}.mp4`);
    }
    /**
     * Check if file exists
     */
    fileExists(filePath) {
        return fs_1.default.existsSync(filePath);
    }
    /**
     * Delete file
     */
    deleteFile(filePath) {
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
        }
    }
}
exports.storageService = new StorageService();
