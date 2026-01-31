import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import uploadRoutes from './routes/upload';
import jobsRoutes from './routes/jobs';
import clipsRoutes from './routes/clips';
import subtitlesRoutes from './routes/subtitles';
import { jobProcessor } from './services/processor';
import { initDatabase } from './services/database';

const app = express();

// Initialize database
initDatabase();

// Middleware
app.use(cors());
app.use(express.json());

// Serve storage files (videos, clips, transcripts)
app.use('/storage', express.static(path.join(__dirname, '../storage')));
app.use('/storage/final', express.static(path.join(__dirname, '../storage/final')));

// API routes
app.use('/api/upload', uploadRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/clips', clipsRoutes);
app.use('/api/clips', subtitlesRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(config.port, () => {
    console.log(`Backend server running on port ${config.port}`);
    console.log(`AI Service URL: ${config.aiServiceUrl}`);

    // Start job processor
    jobProcessor.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    jobProcessor.stop();
    process.exit(0);
});
