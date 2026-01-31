/**
 * Custom error classes for structured error handling
 */

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly context?: Record<string, any>;

    constructor(
        message: string,
        statusCode: number = 500,
        context?: Record<string, any>
    ) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        this.context = context;

        // Maintains proper stack trace for where our error was thrown
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message: string, context?: Record<string, any>) {
        super(message, 400, context);
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string, id?: string) {
        const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
        super(message, 404, { resource, id });
        this.name = 'NotFoundError';
    }
}

export class DatabaseError extends AppError {
    constructor(message: string, context?: Record<string, any>) {
        super(`Database error: ${message}`, 500, context);
        this.name = 'DatabaseError';
    }
}

export class FFmpegError extends AppError {
    constructor(message: string, context?: Record<string, any>) {
        super(`FFmpeg error: ${message}`, 500, context);
        this.name = 'FFmpegError';
    }
}

export class TranscriptError extends AppError {
    constructor(message: string, context?: Record<string, any>) {
        super(`Transcript error: ${message}`, 500, context);
        this.name = 'TranscriptError';
    }
}
