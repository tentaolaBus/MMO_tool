"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const config_1 = require("./config");
const upload_1 = __importDefault(require("./routes/upload"));
const jobs_1 = __importDefault(require("./routes/jobs"));
const clips_1 = __importDefault(require("./routes/clips"));
const progress_1 = __importDefault(require("./routes/progress"));
const subtitles_1 = __importDefault(require("./routes/subtitles"));
const auth_1 = __importDefault(require("./routes/auth"));
const reframe_1 = __importDefault(require("./routes/reframe"));
const subtitle_standalone_1 = __importDefault(require("./routes/subtitle-standalone"));
const processor_1 = require("./services/processor");
const queue_1 = require("./services/queue");
const reframeQueue_1 = require("./services/reframeQueue");
const subtitleQueue_1 = require("./services/subtitleQueue");
const cleanupService_1 = require("./services/cleanupService");
const database_1 = require("./services/database");
const errorHandler_1 = require("./middleware/errorHandler");
require("./services/database");
const app = (0, express_1.default)();
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
].filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
app.use('/storage/final', express_1.default.static(path_1.default.join(__dirname, '../storage/final'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-store, must-revalidate') }));
app.use('/storage', express_1.default.static(path_1.default.join(__dirname, '../storage')));
app.use('/api/auth', auth_1.default);
app.use('/api/upload', upload_1.default);
app.use('/api/jobs', jobs_1.default);
app.use('/api/jobs', progress_1.default);
app.use('/api/clips', clips_1.default);
app.use('/api/clips', subtitles_1.default);
app.use('/api/reframe', reframe_1.default);
app.use('/api/subtitles', subtitle_standalone_1.default);
app.get('/health', (req, res) => {
    res.json({ status: 'ok', codeVersion: 'PIPELINE_FIX_2026_04_14', timestamp: new Date().toISOString() });
});
app.use(errorHandler_1.notFoundHandler);
app.use(errorHandler_1.errorHandler);
process.on('unhandledRejection', (reason, promise) => {
    console.error('\n❌ === UNHANDLED PROMISE REJECTION ===');
    console.error('Reason:', reason);
    console.error('Promise:', promise);
    console.error('================\n');
});
process.on('uncaughtException', (error) => {
    console.error('\n❌ === UNCAUGHT EXCEPTION ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('================\n');
    process.exit(1);
});
const server = app.listen(config_1.config.port, "0.0.0.0", () => {
    console.log('\n🚀 ===================================');
    console.log('   MMO Video Tool - Backend Server');
    console.log('   ===================================');
    console.log(`   📡 Port:        ${config_1.config.port}`);
    console.log(`   🤖 AI Service:  ${config_1.config.aiServiceUrl}`);
    console.log(`   📂 Storage:     ./storage`);
    console.log(`   ⏰ Started:     ${new Date().toLocaleTimeString()}`);
    console.log('   ===================================\n');
    processor_1.jobProcessor.start();
    console.log('✅ Job processor started');
    reframeQueue_1.reframeProcessor.start();
    console.log('✅ Reframe processor started');
    subtitleQueue_1.subtitleProcessor.start();
    console.log('✅ Subtitle processor started');
    cleanupService_1.cleanupService.start();
    console.log('');
});
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error('\n❌ ERROR: Port already in use!');
        console.error(`   Port ${config_1.config.port} is already being used by another process.`);
        console.error('\n💡 Solutions:');
        console.error(`   1. Kill the process: netstat -ano | findstr :${config_1.config.port}`);
        console.error('      Then: taskkill /PID <PID> /F');
        console.error(`   2. Change port in .env: PORT=<new_port>`);
        console.error('   3. Stop other dev servers\n');
        process.exit(1);
    }
    else if (error.code === 'EACCES') {
        console.error('\n❌ ERROR: Permission denied!');
        console.error(`   Port ${config_1.config.port} requires elevated privileges.`);
        console.error('   Try using a port >= 1024\n');
        process.exit(1);
    }
    else {
        console.error('\n❌ Server error:', error);
        process.exit(1);
    }
});
const shutdown = async (signal) => {
    console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
        console.log('✅ HTTP server closed');
        await processor_1.jobProcessor.stop();
        console.log('✅ Job processor stopped');
        await reframeQueue_1.reframeProcessor.stop();
        console.log('✅ Reframe processor stopped');
        await subtitleQueue_1.subtitleProcessor.stop();
        console.log('✅ Subtitle processor stopped');
        cleanupService_1.cleanupService.stop();
        await queue_1.videoQueue.close();
        await reframeQueue_1.reframeQueue.close();
        await subtitleQueue_1.subtitleQueue.close();
        console.log('✅ Redis queues closed');
        (0, database_1.closeDatabase)();
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
