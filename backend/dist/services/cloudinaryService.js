"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinaryService = void 0;
const cloudinary_1 = require("cloudinary");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Configure Cloudinary from environment variables
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
/**
 * Cloudinary Service for video uploads
 */
class CloudinaryService {
    /**
     * Check if Cloudinary is configured
     */
    isConfigured() {
        return !!(process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET);
    }
    /**
     * Upload a video clip to Cloudinary
     * @param filePath - Local path to the video file
     * @param clipId - Unique identifier for the clip
     * @returns Upload result with Cloudinary metadata
     */
    async uploadClip(filePath, clipId) {
        if (!this.isConfigured()) {
            throw new Error('Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.');
        }
        if (!fs_1.default.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        console.log(`☁️ Uploading clip ${clipId} to Cloudinary...`);
        try {
            const result = await cloudinary_1.v2.uploader.upload(filePath, {
                resource_type: 'video',
                public_id: `mmo-clips/${clipId}`,
                folder: 'mmo-video-clipper',
                overwrite: true,
                // Optimize for vertical video playback
                transformation: [
                    { quality: 'auto' },
                    { fetch_format: 'mp4' }
                ]
            });
            console.log(`✅ Clip uploaded to Cloudinary: ${result.secure_url}`);
            return {
                publicId: result.public_id,
                secureUrl: result.secure_url,
                duration: result.duration || 0,
                format: result.format,
                bytes: result.bytes,
                createdAt: new Date().toISOString(),
            };
        }
        catch (error) {
            console.error('❌ Cloudinary upload failed:', error.message);
            throw new Error(`Cloudinary upload failed: ${error.message}`);
        }
    }
    /**
     * Delete a video from Cloudinary
     * @param publicId - Cloudinary public ID
     */
    async deleteClip(publicId) {
        if (!this.isConfigured()) {
            return;
        }
        try {
            await cloudinary_1.v2.uploader.destroy(publicId, { resource_type: 'video' });
            console.log(`🗑️ Deleted clip from Cloudinary: ${publicId}`);
        }
        catch (error) {
            console.error('❌ Cloudinary delete failed:', error.message);
        }
    }
    /**
     * Delete local file after successful upload
     * @param filePath - Path to local file
     */
    deleteLocalFile(filePath) {
        try {
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
                console.log(`🗑️ Deleted local file: ${path_1.default.basename(filePath)}`);
            }
        }
        catch (error) {
            console.error(`⚠️ Failed to delete local file ${filePath}:`, error.message);
        }
    }
    /**
     * Get the URL for a clip by public ID
     * @param publicId - Cloudinary public ID
     * @returns Secure URL
     */
    getClipUrl(publicId) {
        return cloudinary_1.v2.url(publicId, {
            resource_type: 'video',
            secure: true,
        });
    }
}
exports.cloudinaryService = new CloudinaryService();
