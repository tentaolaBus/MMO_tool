import { Router, Request, Response } from 'express';
import { progressService } from '../services/progress';
import { getVideoJob, readJobProgress } from '../services/queue';

const router = Router();

/**
 * GET /api/jobs/:jobId/progress/stream
 * Server-Sent Events endpoint for real-time progress updates.
 *
 * The client connects once with EventSource and receives push updates
 * as `data: {...}\n\n` lines. The connection auto-closes on completion/failure.
 */
router.get('/:jobId/progress/stream', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    console.log(`📡 [SSE] Client connected for job: ${jobId}`);

    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering
    });

    let closed = false;
    const closeConnection = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        res.end();
    };

    const safeSend = (data: object) => {
        if (closed) return;
        try {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
            closeConnection();
        }
    };

    // IMPORTANT: Subscribe FIRST to avoid race condition.
    // If the job completes between checking initial state and subscribing,
    // the event would be lost. By subscribing first, we buffer any events
    // that arrive during the initial state check.
    let receivedTerminal = false;
    const unsubscribe = progressService.subscribe(jobId, (update) => {
        console.log(`📡 [SSE] Pushing update for ${jobId}: ${update.stage} ${update.percent}%`);
        safeSend(update);

        // Auto-close on terminal states
        if (update.stage === 'completed' || update.stage === 'failed') {
            receivedTerminal = true;
            setTimeout(() => closeConnection(), 500);
        }
    });

    // Now check initial state (subscription is already active, so no gap)
    if (!receivedTerminal) {
        const current = progressService.get(jobId);
        if (current) {
            console.log(`📡 [SSE] Sending cached progress for ${jobId}: ${current.stage} ${current.percent}%`);
            safeSend(current);
            if (current.stage === 'completed' || current.stage === 'failed') {
                receivedTerminal = true;
                setTimeout(() => closeConnection(), 500);
            }
        } else {
            // No cached progress — fall back to BullMQ. Important: never emit
            // `stage: 'unknown'` because the frontend's step mapping treats
            // unknown stages as "Uploading 5%" → causes the classic stuck UI.
            try {
                const job = await getVideoJob(jobId);
                if (!job) {
                    // Job not in Redis (already evicted by removeOnComplete or never queued).
                    // Treat as completed so the UI moves forward instead of hanging.
                    console.log(`📡 [SSE] Job ${jobId} not in Redis → assuming completed`);
                    safeSend({ percent: 100, stage: 'completed', message: 'Job already finished', timestamp: Date.now() });
                    receivedTerminal = true;
                    setTimeout(() => closeConnection(), 250);
                } else {
                    const state = await job.getState();
                    // Single source of truth for progress shape coercion
                    const p = readJobProgress(job.progress);
                    const percent = p.percent;
                    const stage = p.stage || state;
                    const message = p.message || `Job ${state}`;

                    if (state === 'completed') {
                        console.log(`📡 [SSE] Job ${jobId} already completed in BullMQ`);
                        safeSend({ percent: 100, stage: 'completed', message: 'Processing complete', timestamp: Date.now() });
                        receivedTerminal = true;
                        setTimeout(() => closeConnection(), 500);
                    } else if (state === 'failed') {
                        console.log(`📡 [SSE] Job ${jobId} already failed in BullMQ`);
                        safeSend({ percent: 0, stage: 'failed', message: job.failedReason || 'Processing failed', timestamp: Date.now() });
                        receivedTerminal = true;
                        setTimeout(() => closeConnection(), 500);
                    } else {
                        safeSend({ percent, stage, message, timestamp: Date.now() });
                    }
                }
            } catch (err) {
                console.warn(`📡 [SSE] Error checking BullMQ for ${jobId}:`, err);
            }
        }
    }

    // Heartbeat to keep connection alive (every 30s)
    const heartbeat = setInterval(() => {
        if (closed) { clearInterval(heartbeat); return; }
        try {
            res.write(`: heartbeat\n\n`);
        } catch {
            clearInterval(heartbeat);
        }
    }, 30000);

    // Clean up on client disconnect
    req.on('close', () => {
        console.log(`📡 [SSE] Client disconnected for job: ${jobId}`);
        closeConnection();
    });
});

export default router;
