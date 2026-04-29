import * as cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

/**
 * Storage cleanup service.
 *
 * Runs on a cron schedule to delete old temp files, uploads,
 * processed videos, and other artifacts that are no longer needed.
 */
class CleanupService {
    private task: cron.ScheduledTask | null = null;

    /**
     * Start the cleanup cron job.
     */
    start(): void {
        // Run every N hours (e.g. '0 */2 * * *' = every 2 hours)
        const cronExpr = `0 */${config.cleanupIntervalHours} * * *`;

        this.task = cron.schedule(cronExpr, () => {
            console.log('\n🧹 === STORAGE CLEANUP CRON ===');
            this.runCleanup();
            console.log('🧹 === CLEANUP DONE ===\n');
        });

        console.log(`✅ Cleanup cron started (every ${config.cleanupIntervalHours}h, max age: ${config.cleanupMaxAgeHours}h)`);
    }

    /**
     * Stop the cron job.
     */
    stop(): void {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
        console.log('✅ Cleanup cron stopped');
    }

    /**
     * Run cleanup immediately (can also be called manually).
     */
    runCleanup(): void {
        const maxAgeMs = config.cleanupMaxAgeHours * 60 * 60 * 1000;
        const cutoff = Date.now() - maxAgeMs;

        const storageDir = path.resolve(config.storageDir);
        const uploadDir = path.resolve(config.uploadDir);

        let totalDeleted = 0;
        let totalErrors = 0;

        // Clean subdirectories of storage
        const subDirs = [
            'videos', 'audio', 'transcripts', 'clips',
            'reframed', 'final', 'temp', 'subtitles',
            'youtube', 'analysis',
        ];

        for (const sub of subDirs) {
            const dirPath = path.join(storageDir, sub);
            const result = this.cleanDirectory(dirPath, cutoff);
            totalDeleted += result.deleted;
            totalErrors += result.errors;
        }

        // Clean upload temp dir
        const uploadResult = this.cleanDirectory(uploadDir, cutoff);
        totalDeleted += uploadResult.deleted;
        totalErrors += uploadResult.errors;

        console.log(`   🧹 Total: ${totalDeleted} files deleted, ${totalErrors} errors`);
    }

    /**
     * Delete all files in a directory older than the cutoff timestamp.
     */
    private cleanDirectory(dirPath: string, cutoffMs: number): { deleted: number; errors: number } {
        let deleted = 0;
        let errors = 0;

        if (!fs.existsSync(dirPath)) {
            return { deleted, errors };
        }

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    // Recurse into subdirectories (e.g. analysis/{jobId}/)
                    const sub = this.cleanDirectory(fullPath, cutoffMs);
                    deleted += sub.deleted;
                    errors += sub.errors;

                    // Remove empty directories
                    try {
                        const remaining = fs.readdirSync(fullPath);
                        if (remaining.length === 0) {
                            fs.rmdirSync(fullPath);
                            console.log(`   🗑️  Removed empty dir: ${path.basename(fullPath)}`);
                        }
                    } catch {}
                    continue;
                }

                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.mtimeMs < cutoffMs) {
                        fs.unlinkSync(fullPath);
                        deleted++;
                        console.log(`   🗑️  Deleted: ${path.relative(path.resolve(config.storageDir), fullPath)}`);
                    }
                } catch (e: any) {
                    errors++;
                    console.error(`   ❌ Failed to delete ${entry.name}: ${e.message}`);
                }
            }
        } catch (e: any) {
            console.error(`   ❌ Failed to read dir ${dirPath}: ${e.message}`);
            errors++;
        }

        return { deleted, errors };
    }
}

export const cleanupService = new CleanupService();
