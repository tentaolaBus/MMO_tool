"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
// Configuration for the backend service
exports.config = {
    port: process.env.PORT || 3001,
    aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:5000',
    uploadDir: './uploads',
    storageDir: './storage',
    maxFileSize: 500 * 1024 * 1024, // 500MB
    allowedVideoTypes: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'],
    // Cloudinary configuration
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
        apiKey: process.env.CLOUDINARY_API_KEY || '',
        apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    },
};
