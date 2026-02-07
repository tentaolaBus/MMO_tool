"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const upload_1 = __importDefault(require("./routes/upload"));
const jobs_1 = __importDefault(require("./routes/jobs"));
const clips_1 = __importDefault(require("./routes/clips"));
const subtitles_1 = __importDefault(require("./routes/subtitles"));
const auth_1 = __importDefault(require("./routes/auth"));
const processor_1 = require("./services/processor");
const database_1 = require("./services/database");
const errorHandler_1 = require("./middleware/errorHandler");
// Import database service - initialization happens automatically on import
require("./services/database");
// Initialize SQL Server database and users table
const sqlServer_1 = require("./config/sqlServer");
(0, sqlServer_1.initSqlServerDatabase)().catch(err => console.error('SQL Server init failed:', err));
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve storage files (videos, clips, transcripts)
app.use('/storage', express_1.default.static(path_1.default.join(__dirname, '../storage')));
app.use('/storage/final', express_1.default.static(path_1.default.join(__dirname, '../storage/final')));
// API routes
app.use('/api/auth', auth_1.default);
app.use('/api/upload', upload_1.default);
app.use('/api/jobs', jobs_1.default);
app.use('/api/clips', clips_1.default);
app.use('/api/clips', subtitles_1.default);
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// 404 handler (must be after all routes)
app.use(errorHandler_1.notFoundHandler);
// Global error handler (must be last)
app.use(errorHandler_1.errorHandler);
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('\n❌ === UNHANDLED PROMISE REJECTION ===');
    console.error('Reason:', reason);
    console.error('Promise:', promise);
    console.error('================\n');
    // In production, you might want to shut down gracefully
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('\n❌ === UNCAUGHT EXCEPTION ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('================\n');
    // Shutdown gracefully
    process.exit(1);
});
// Start server
const server = app.listen(config_1.config.port, () => {
    console.log('\n🚀 ===================================');
    console.log('   MMO Video Tool - Backend Server');
    console.log('   ===================================');
    console.log(`   📡 Port:        ${config_1.config.port}`);
    console.log(`   🤖 AI Service:  ${config_1.config.aiServiceUrl}`);
    console.log(`   📂 Storage:     ./storage`);
    console.log(`   ⏰ Started:     ${new Date().toLocaleTimeString()}`);
    console.log('   ===================================\n');
    // Start job processor
    processor_1.jobProcessor.start();
    console.log('✅ Job processor started\n');
});
// Handle server errors
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
// Graceful shutdown
const shutdown = (signal) => {
    console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);
    server.close(() => {
        console.log('✅ HTTP server closed');
        processor_1.jobProcessor.stop();
        console.log('✅ Job processor stopped');
        (0, database_1.closeDatabase)();
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
