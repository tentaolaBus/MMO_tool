import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import uploadRoutes from './routes/upload';
import jobsRoutes from './routes/jobs';
import clipsRoutes from './routes/clips';
import subtitlesRoutes from './routes/subtitles';
import authRoutes from './routes/auth';
import { jobProcessor } from './services/processor';
import { closeDatabase } from './services/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
// Import database service - initialization happens automatically on import
import './services/database';
// Initialize SQL Server database and users table
import { initSqlServerDatabase } from './config/sqlServer';
initSqlServerDatabase().catch(err => console.error('SQL Server init failed:', err));

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve storage files (videos, clips, transcripts)
app.use('/storage', express.static(path.join(__dirname, '../storage')));
app.use('/storage/final', express.static(path.join(__dirname, '../storage/final')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/clips', clipsRoutes);
app.use('/api/clips', subtitlesRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
