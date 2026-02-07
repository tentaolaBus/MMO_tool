"use strict";
/**
 * Custom error classes for structured error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranscriptError = exports.FFmpegError = exports.DatabaseError = exports.NotFoundError = exports.ValidationError = exports.AppError = void 0;
class AppError extends Error {
    constructor(message, statusCode = 500, context) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        this.context = context;
        // Maintains proper stack trace for where our error was thrown
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message, context) {
        super(message, 400, context);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends AppError {
    constructor(resource, id) {
        const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
        super(message, 404, { resource, id });
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
class DatabaseError extends AppError {
    constructor(message, context) {
        super(`Database error: ${message}`, 500, context);
        this.name = 'DatabaseError';
    }
}
exports.DatabaseError = DatabaseError;
class FFmpegError extends AppError {
    constructor(message, context) {
        super(`FFmpeg error: ${message}`, 500, context);
        this.name = 'FFmpegError';
    }
}
exports.FFmpegError = FFmpegError;
class TranscriptError extends AppError {
    constructor(message, context) {
        super(`Transcript error: ${message}`, 500, context);
        this.name = 'TranscriptError';
    }
}
exports.TranscriptError = TranscriptError;
