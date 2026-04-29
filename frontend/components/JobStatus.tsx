'use client';

import { useEffect, useState } from 'react';
import { getJobStatus, Job, Transcript } from '@/lib/api';

interface JobStatusProps {
    jobId: string;
}

export default function JobStatus({ jobId }: JobStatusProps) {
    const [job, setJob] = useState<Job | null>(null);
    const [transcript, setTranscript] = useState<Transcript | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Poll for job status every 3 seconds
        const interval = setInterval(async () => {
            try {
                const jobData = await getJobStatus(jobId);
                setJob(jobData);

                // Stop polling if job is completed or failed
                if (jobData.status === 'completed' || jobData.status === 'failed') {
                    clearInterval(interval);

                    // Load transcript if completed
                    if (jobData.status === 'completed' && jobData.transcriptPath) {
                        // For MVP, we'll just show the path
                        // In production, you'd fetch and display the actual transcript
                    }
                }
            } catch (err: any) {
                setError(err.message);
                clearInterval(interval);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [jobId]);

    if (error) {
        return (
            <div className="w-full max-w-2xl mx-auto p-6 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
                <p className="text-red-600">{error}</p>
            </div>
        );
    }

    if (!job) {
        return (
            <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
            </div>
        );
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'completed': return 'bg-green-100 text-green-800 border-green-200';
            case 'failed': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Job Status</h2>

            <div className="space-y-4">
                <div>
                    <p className="text-sm text-gray-600 mb-1">Job ID</p>
                    <p className="font-mono text-sm bg-gray-50 p-2 rounded">{job.id}</p>
                </div>

                <div>
                    <p className="text-sm text-gray-600 mb-1">Status</p>
                    <span className={`inline-block px-3 py-1 rounded-md border font-semibold ${getStatusColor(job.status)}`}>
                        {job.status.toUpperCase()}
                    </span>
                </div>

                {job.status === 'processing' && (() => {
                    // Defensive parse: backend now sends `progress: number` and
                    // optional `progressDetail: { percent, stage, message }`.
                    // Older builds may still send the object on `progress` itself —
                    // never let an object reach JSX (would throw "Objects are not valid as a React child").
                    const raw: any = (job as any).progress;
                    const detail: any = (job as any).progressDetail;
                    const percent = typeof raw === 'number'
                        ? raw
                        : (raw && typeof raw === 'object' ? raw.percent : detail?.percent) ?? 0;
                    const stage = detail?.stage ?? (raw && typeof raw === 'object' ? raw.stage : undefined);
                    const message = detail?.message ?? (raw && typeof raw === 'object' ? raw.message : undefined);
                    return (
                        <div>
                            <p className="text-sm text-gray-600 mb-2">Progress</p>
                            <div className="w-full bg-gray-200 rounded-full h-4">
                                <div
                                    className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                                    style={{ width: `${percent}%` }}
                                />
                            </div>
                            <p className="text-sm text-gray-600 mt-1">
                                {percent}%{stage ? ` — ${stage}` : ''}
                            </p>
                            {message && <p className="text-xs text-gray-500 mt-0.5">{message}</p>}
                        </div>
                    );
                })()}

                {job.error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm font-semibold text-red-800 mb-1">Error</p>
                        <p className="text-sm text-red-600">{job.error}</p>
                    </div>
                )}

                {job.status === 'completed' && (
                    <div className="space-y-3">
                        <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                            <p className="text-sm font-semibold text-green-800 mb-2">✓ Processing Complete!</p>

                            {job.audioPath && (
                                <p className="text-sm text-gray-700 mb-1">
                                    <strong>Audio:</strong> <span className="font-mono text-xs">{job.audioPath}</span>
                                </p>
                            )}

                            {job.transcriptPath && (
                                <p className="text-sm text-gray-700">
                                    <strong>Transcript:</strong> <span className="font-mono text-xs">{job.transcriptPath}</span>
                                </p>
                            )}
                        </div>

                        <p className="text-sm text-gray-600">
                            The transcript has been generated successfully. In the next phase, we'll add clip detection and subtitle generation.
                        </p>
                    </div>
                )}

                <div className="text-xs text-gray-500">
                    <p>Created: {new Date(job.createdAt).toLocaleString()}</p>
                    <p>Updated: {new Date(job.updatedAt).toLocaleString()}</p>
                </div>
            </div>
        </div>
    );
}
