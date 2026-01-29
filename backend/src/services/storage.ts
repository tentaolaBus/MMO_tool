import fs from 'fs';
import path from 'path';
import { config } from '../config';

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
    private ensureDirectories() {
        const dirs = [
            path.resolve(config.uploadDir),
            path.resolve(config.storageDir),
            path.resolve(config.storageDir, 'videos'),
            path.resolve(config.storageDir, 'audio'),
            path.resolve(config.storageDir, 'transcripts'),
        ];

        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * Move uploaded file to permanent storage
     */
    moveToStorage(sourcePath: string, destinationPath: string): void {
        fs.renameSync(sourcePath, destinationPath);
    }

    /**
     * Get full path for video storage
     */
    getVideoPath(jobId: string, extension: string = 'mp4'): string {
        return path.resolve(config.storageDir, 'videos', `${jobId}.${extension}`);
    }

    /**
     * Get full path for audio storage
     */
    getAudioPath(jobId: string): string {
        return path.resolve(config.storageDir, 'audio', `${jobId}.mp3`);
    }

    /**
     * Get full path for transcript storage
     */
    getTranscriptPath(jobId: string): string {
        return path.resolve(config.storageDir, 'transcripts', `${jobId}.json`);
    }

    /**
     * Check if file exists
     */
    fileExists(filePath: string): boolean {
        return fs.existsSync(filePath);
    }

    /**
     * Delete file
     */
    deleteFile(filePath: string): void {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

export const storageService = new StorageService();
