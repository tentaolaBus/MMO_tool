import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Rate limiter for upload endpoints.
 * Limits requests per IP within a configurable window.
 */
export const uploadRateLimit = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
        success: false,
        message: `Too many requests. Please try again in ${config.rateLimit.windowMs / 60000} minutes.`,
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
});

// ─── IP-based concurrent job tracking ────────────────────────────────────

const activeJobsByIp = new Map<string, Set<string>>();

/**
 * Track an active job for an IP address.
 */
export function trackJob(ip: string, jobId: string): void {
    if (!activeJobsByIp.has(ip)) {
        activeJobsByIp.set(ip, new Set());
    }
    activeJobsByIp.get(ip)!.add(jobId);
    console.log(`📊 [RateLimit] IP ${ip} now has ${activeJobsByIp.get(ip)!.size} active jobs`);
}

/**
 * Release a tracked job for an IP address.
 */
export function releaseJob(ip: string, jobId: string): void {
    const jobs = activeJobsByIp.get(ip);
    if (jobs) {
        jobs.delete(jobId);
        if (jobs.size === 0) {
            activeJobsByIp.delete(ip);
        }
    }
}

/**
 * Middleware: Limit concurrent jobs per IP address.
 * Rejects new uploads if the IP already has too many active jobs.
 */
export function concurrentJobLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const currentJobs = activeJobsByIp.get(ip);
    const count = currentJobs ? currentJobs.size : 0;

    if (count >= config.maxConcurrentJobsPerIp) {
        console.warn(`⚠️  [RateLimit] IP ${ip} blocked — ${count} concurrent jobs (max: ${config.maxConcurrentJobsPerIp})`);
        res.status(429).json({
            success: false,
            message: `Too many concurrent jobs (${count}/${config.maxConcurrentJobsPerIp}). Please wait for current jobs to finish.`,
        });
        return;
    }

    next();
}
