// Configuration for the backend service
export const config = {
    port: process.env.PORT || 3001,
    aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:5000',
    uploadDir: './uploads',
    storageDir: './storage',
    maxFileSize: 500 * 1024 * 1024, // 500MB
    allowedVideoTypes: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'],
};
