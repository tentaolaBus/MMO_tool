import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import fs from 'fs';
import path from 'path';

// Configure Cloudinary from environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface CloudinaryUploadResult {
    publicId: string;
    secureUrl: string;
    duration: number;
    format: string;
    bytes: number;
    createdAt: string;
}

/**
 * Cloudinary Service for video uploads
 */
class CloudinaryService {
    /**
     * Check if Cloudinary is configured
     */
    isConfigured(): boolean {
        return !!(
            process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET
        );
    }

    /**
     * Upload a video clip to Cloudinary
     * @param filePath - Local path to the video file
     * @param clipId - Unique identifier for the clip
     * @returns Upload result with Cloudinary metadata
     */
    async uploadClip(filePath: string, clipId: string): Promise<CloudinaryUploadResult> {
        if (!this.isConfigured()) {
            throw new Error('Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.');
        }

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        console.log(`☁️ Uploading clip ${clipId} to Cloudinary...`);

        try {
            const result: UploadApiResponse = await cloudinary.uploader.upload(filePath, {
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
        } catch (error: any) {
            console.error('❌ Cloudinary upload failed:', error.message);
            throw new Error(`Cloudinary upload failed: ${error.message}`);
        }
    }

    /**
     * Delete a video from Cloudinary
     * @param publicId - Cloudinary public ID
     */
    async deleteClip(publicId: string): Promise<void> {
        if (!this.isConfigured()) {
            return;
        }

        try {
            await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
            console.log(`🗑️ Deleted clip from Cloudinary: ${publicId}`);
        } catch (error: any) {
            console.error('❌ Cloudinary delete failed:', error.message);
        }
    }

    /**
     * Delete local file after successful upload
     * @param filePath - Path to local file
     */
    deleteLocalFile(filePath: string): void {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Deleted local file: ${path.basename(filePath)}`);
            }
        } catch (error: any) {
            console.error(`⚠️ Failed to delete local file ${filePath}:`, error.message);
        }
    }

    /**
     * Get the URL for a clip by public ID
     * @param publicId - Cloudinary public ID
     * @returns Secure URL
     */
    getClipUrl(publicId: string): string {
        return cloudinary.url(publicId, {
            resource_type: 'video',
            secure: true,
        });
    }
}

export const cloudinaryService = new CloudinaryService();
