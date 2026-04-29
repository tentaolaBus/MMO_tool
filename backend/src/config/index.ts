// Configuration for the backend service
export const config = {
    port: Number(process.env.PORT) || 10000,
    aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:5000',
    uploadDir: './uploads',
    storageDir: './storage',
    maxFileSize: 500 * 1024 * 1024, // 500MB
    allowedVideoTypes: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'],
    aiRequestTimeoutMs: 5 * 60 * 1000,
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null as null,
    },

    // ─── Rate Limiting ───────────────────────────────────────
    rateLimit: {
        windowMs: 15 * 60 * 1000,   // 15-minute window
        maxRequests: Number(process.env.RATE_LIMIT_MAX) || 100, // generous for dev, restrict in prod
    },
    maxConcurrentJobsPerIp: Number(process.env.MAX_CONCURRENT_JOBS) || 5,

    // ─── YouTube ─────────────────────────────────────────────
    maxYoutubeDurationSec: 30 * 60,  // 30 min max

    // ─── Storage Cleanup ─────────────────────────────────────
    cleanupIntervalHours: 2,         // run cleanup every 2 hours
    cleanupMaxAgeHours: 2,           // delete files older than 2 hours
};
