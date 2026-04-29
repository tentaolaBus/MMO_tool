import { EventEmitter } from 'events';

export interface ProgressUpdate {
    percent: number;
    stage: string;
    message: string;
    timestamp: number;
}

/**
 * In-memory progress store with EventEmitter for SSE push.
 * Each jobId has a current state and any number of SSE subscribers.
 */
class ProgressService extends EventEmitter {
    private store = new Map<string, ProgressUpdate>();

    /** Update progress for a job and notify all SSE subscribers */
    update(jobId: string, percent: number, stage: string, message: string): void {
        const update: ProgressUpdate = {
            percent: Math.min(100, Math.max(0, percent)),
            stage,
            message,
            timestamp: Date.now(),
        };
        this.store.set(jobId, update);
        this.emit(`progress:${jobId}`, update);
    }

    /** Get current progress (for initial SSE connection or polling fallback) */
    get(jobId: string): ProgressUpdate | undefined {
        return this.store.get(jobId);
    }

    /** Clean up completed job from memory */
    remove(jobId: string): void {
        this.store.delete(jobId);
    }

    /** Subscribe to progress updates for a job — returns unsubscribe fn */
    subscribe(jobId: string, listener: (update: ProgressUpdate) => void): () => void {
        const event = `progress:${jobId}`;
        this.on(event, listener);
        return () => this.off(event, listener);
    }
}

// Singleton
export const progressService = new ProgressService();

// Increase max listeners since each SSE connection adds one
progressService.setMaxListeners(100);
