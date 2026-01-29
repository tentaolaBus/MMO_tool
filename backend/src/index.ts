import express from 'express';
import cors from 'cors';
import { config } from './config';
import uploadRoutes from './routes/upload';
import jobsRoutes from './routes/jobs';
import clipsRoutes from './routes/clips';
import { jobProcessor } from './services/processor';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/clips', clipsRoutes);

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
