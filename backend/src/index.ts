import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config();

import { config } from './config';
import uploadRoutes from './routes/upload';
import jobsRoutes from './routes/jobs';
import clipsRoutes from './routes/clips';
import subtitlesRoutes from './routes/subtitles';
import authRoutes from './routes/auth';
import { jobProcessor } from './services/processor';
import { closeDatabase } from './services/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
// Import database service - Supabase connection is established on import
import './services/database';

const app = express();

// CORS configuration — restrict origins in production
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
].filter(Boolean) as string[];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
app.use(express.json());

// Serve storage files (videos, clips, transcripts)
// For /storage/final/ — disable browser caching so re-rendered videos always load fresh
app.use('/storage/final', express.static(
    path.join(__dirname, '../storage/final'),
    { setHeaders: (res) => res.setHeader('Cache-Control', 'no-store, must-revalidate') }
));
// For everything else under /storage/
app.use('/storage', express.static(path.join(__dirname, '../storage')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/clips', clipsRoutes);
app.use('/api/clips', subtitlesRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', codeVersion: 'FIX_2026_02_20_V3', timestamp: new Date().toISOString() });
});

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise) => {
    console.error('\n❌ === UNHANDLED PROMISE REJECTION ===');
    console.error('Reason:', reason);
    console.error('Promise:', promise);
    console.error('================\n');
    // In production, you might want to shut down gracefully
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
    console.error('\n❌ === UNCAUGHT EXCEPTION ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('================\n');

    // Shutdown gracefully
    process.exit(1);
});

// Start server
const server = app.listen(config.port, () => {
    console.log('\n🚀 ===================================');
    console.log('   MMO Video Tool - Backend Server');
    console.log('   ===================================');
    console.log(`   📡 Port:        ${config.port}`);
    console.log(`   🤖 AI Service:  ${config.aiServiceUrl}`);
    console.log(`   📂 Storage:     ./storage`);
    console.log(`   ⏰ Started:     ${new Date().toLocaleTimeString()}`);
    console.log('   ===================================\n');

    // Start job processor
    jobProcessor.start();
    console.log('✅ Job processor started\n');
});

// Handle server errors
server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
        console.error('\n❌ ERROR: Port already in use!');
        console.error(`   Port ${config.port} is already being used by another process.`);
        console.error('\n💡 Solutions:');
        console.error(`   1. Kill the process: netstat -ano | findstr :${config.port}`);
        console.error('      Then: taskkill /PID <PID> /F');
        console.error(`   2. Change port in .env: PORT=<new_port>`);
        console.error('   3. Stop other dev servers\n');
        process.exit(1);
    } else if (error.code === 'EACCES') {
        console.error('\n❌ ERROR: Permission denied!');
        console.error(`   Port ${config.port} requires elevated privileges.`);
        console.error('   Try using a port >= 1024\n');
        process.exit(1);
    } else {
        console.error('\n❌ Server error:', error);
        process.exit(1);
    }
});

// Graceful shutdown
const shutdown = (signal: string) => {
    console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);

    server.close(() => {
        console.log('✅ HTTP server closed');

        jobProcessor.stop();
        console.log('✅ Job processor stopped');

        closeDatabase();
        console.log('✅ Database connection closed');

        console.log('👋 Goodbye!\n');
        process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.error('⚠️  Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
