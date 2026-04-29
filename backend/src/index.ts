import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

import { config } from './config';
import uploadRoutes from './routes/upload';
import jobsRoutes from './routes/jobs';
import clipsRoutes from './routes/clips';
import progressRoutes from './routes/progress';
import subtitlesRoutes from './routes/subtitles';
import authRoutes from './routes/auth';
import reframeRoutes from './routes/reframe';
import subtitleStandaloneRoutes from './routes/subtitle-standalone';
import { jobProcessor } from './services/processor';
import { videoQueue } from './services/queue';
import { reframeQueue, reframeProcessor } from './services/reframeQueue';
import { subtitleQueue, subtitleProcessor } from './services/subtitleQueue';
import { cleanupService } from './services/cleanupService';
import { closeDatabase } from './services/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import './services/database';

const app = express();

const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
].filter(Boolean) as string[];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/storage/final', express.static(
    path.join(__dirname, '../storage/final'),
    { setHeaders: (res) => res.setHeader('Cache-Control', 'no-store, must-revalidate') }
));
app.use('/storage', express.static(path.join(__dirname, '../storage')));

app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/jobs', progressRoutes);
app.use('/api/clips', clipsRoutes);
app.use('/api/clips', subtitlesRoutes);
app.use('/api/reframe', reframeRoutes);
app.use('/api/subtitles', subtitleStandaloneRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', codeVersion: 'PIPELINE_FIX_2026_04_14', timestamp: new Date().toISOString() });
});

app.use(notFoundHandler);
app.use(errorHandler);

process.on('unhandledRejection', (reason: any, promise) => {
    console.error('\n❌ === UNHANDLED PROMISE REJECTION ===');
    console.error('Reason:', reason);
    console.error('Promise:', promise);
    console.error('================\n');
});

process.on('uncaughtException', (error: Error) => {
    console.error('\n❌ === UNCAUGHT EXCEPTION ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('================\n');
    process.exit(1);
});

const server = app.listen(config.port, "0.0.0.0", () => {
    console.log('\n🚀 ===================================');
    console.log('   MMO Video Tool - Backend Server');
    console.log('   ===================================');
    console.log(`   📡 Port:        ${config.port}`);
    console.log(`   🤖 AI Service:  ${config.aiServiceUrl}`);
    console.log(`   📂 Storage:     ./storage`);
    console.log(`   ⏰ Started:     ${new Date().toLocaleTimeString()}`);
    console.log('   ===================================\n');

    jobProcessor.start();
    console.log('✅ Job processor started');

    reframeProcessor.start();
    console.log('✅ Reframe processor started');

    subtitleProcessor.start();
    console.log('✅ Subtitle processor started');

    cleanupService.start();
    console.log('');
});

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

const shutdown = async (signal: string) => {
    console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
        console.log('✅ HTTP server closed');

        await jobProcessor.stop();
        console.log('✅ Job processor stopped');

        await reframeProcessor.stop();
        console.log('✅ Reframe processor stopped');

        await subtitleProcessor.stop();
        console.log('✅ Subtitle processor stopped');

        cleanupService.stop();

        await videoQueue.close();
        await reframeQueue.close();
        await subtitleQueue.close();
        console.log('✅ Redis queues closed');

        closeDatabase();
        console.log('✅ Database connection closed');

        console.log('👋 Goodbye!\n');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('⚠️  Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
