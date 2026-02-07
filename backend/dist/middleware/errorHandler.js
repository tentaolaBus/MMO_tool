"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
exports.asyncHandler = asyncHandler;
const errors_1 = require("../utils/errors");
/**
 * Global error handling middleware
 * Must be registered AFTER all routes
 */
function errorHandler(err, req, res, next) {
    // Extract error details
    const isAppError = err instanceof errors_1.AppError;
    const statusCode = isAppError ? err.statusCode : 500;
    const isOperational = isAppError ? err.isOperational : false;
    const context = isAppError ? err.context : undefined;
    // Build context from request
    const requestContext = {
        ...context,
        jobId: req.body?.jobId || req.params?.id || req.params?.jobId,
        clipId: req.params?.clipId,
        userId: req.headers['x-user-id'], // If you add auth later
    };
    // Log error with full context
    const logPrefix = isOperational ? '⚠️ ' : '❌';
    console.error(`\n${logPrefix} === ERROR ===`);
    console.error(`📍 Route: ${req.method} ${req.path}`);
    console.error(`🔢 Status: ${statusCode}`);
    console.error(`💬 Message: ${err.message}`);
    const hasContext = Object.values(requestContext).some(v => v !== undefined);
    if (hasContext) {
        console.error(`📋 Context:`, JSON.stringify(requestContext, null, 2));
    }
    if (!isOperational) {
        console.error(`📚 Stack:`, err.stack);
    }
    console.error('================\n');
    // Build error response
    const errorResponse = {
        success: false,
        error: {
            message: err.message || 'An unexpected error occurred',
            statusCode,
            type: err.name,
            context: requestContext,
        },
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
    };
    // Include stack trace in development
    if (process.env.NODE_ENV !== 'production') {
        errorResponse.error.stack = err.stack;
    }
    // Send error response
    res.status(statusCode).json(errorResponse);
}
/**
 * Catch-all for 404 Not Found
 */
function notFoundHandler(req, res) {
    console.warn(`⚠️  404 Not Found: ${req.method} ${req.path}`);
    res.status(404).json({
        success: false,
        error: {
            message: `Route not found: ${req.method} ${req.path}`,
            statusCode: 404,
            type: 'NotFoundError',
        },
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
    });
}
/**
 * Async handler wrapper to catch promise rejections
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
