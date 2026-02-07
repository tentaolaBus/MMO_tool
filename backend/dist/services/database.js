"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queries = exports.db = void 0;
exports.initDatabase = initDatabase;
exports.closeDatabase = closeDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Database path
const dbPath = path_1.default.resolve('./storage/app.db');
// Ensure storage directory exists
const storageDir = path_1.default.dirname(dbPath);
if (!fs_1.default.existsSync(storageDir)) {
    fs_1.default.mkdirSync(storageDir, { recursive: true });
}
// Create database connection (exported for use in other services)
exports.db = new better_sqlite3_1.default(dbPath);
// Enable foreign keys
exports.db.pragma('foreign_keys = ON');
/**
 * Initialize database schema
 * MUST be called before any queries are executed
 */
function initDatabase() {
    console.log('Initializing database schema...');
    console.log('Database path:', dbPath);
    try {
        exports.db.exec(`
            -- Jobs table
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                progress INTEGER DEFAULT 0,
                video_path TEXT NOT NULL,
                audio_path TEXT,
                transcript_path TEXT,
                error TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Clips table
            CREATE TABLE IF NOT EXISTS clips (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                clip_index INTEGER NOT NULL,
                video_path TEXT NOT NULL,
                cloudinary_public_id TEXT,
                cloudinary_url TEXT,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                duration REAL NOT NULL,
                text TEXT NOT NULL,
                score_total REAL,
                score_duration REAL,
                score_keyword REAL,
                score_completeness REAL,
                keywords TEXT,
                selected INTEGER DEFAULT 0,
                rendered INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
                UNIQUE(job_id, clip_index)
            );

            -- Indexes
            CREATE INDEX IF NOT EXISTS idx_clips_job_id ON clips(job_id);
            CREATE INDEX IF NOT EXISTS idx_clips_selected ON clips(job_id, selected);
        `);
        console.log('✅ Database schema initialized successfully');
        // Verify tables were created
        const tables = exports.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log('📋 Tables:', tables.map((t) => t.name).join(', '));
    }
    catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    }
}
// Initialize database IMMEDIATELY on module load
// This ensures tables exist before prepared statements are created
initDatabase();
/**
 * Prepared statements for common queries
 * These are created AFTER tables are initialized
 */
exports.queries = {
    // Jobs
    insertJob: exports.db.prepare(`
        INSERT INTO jobs (id, status, progress, video_path, audio_path, transcript_path)
        VALUES (?, ?, ?, ?, ?, ?)
    `),
    getJob: exports.db.prepare(`
        SELECT * FROM jobs WHERE id = ?
    `),
    updateJobStatus: exports.db.prepare(`
        UPDATE jobs 
        SET status = ?, progress = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `),
    updateJobError: exports.db.prepare(`
        UPDATE jobs 
        SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `),
    // Clips
    insertClip: exports.db.prepare(`
        INSERT OR REPLACE INTO clips (
            id, job_id, clip_index, video_path,
            cloudinary_public_id, cloudinary_url,
            start_time, end_time, duration, text,
            score_total, score_duration, score_keyword, score_completeness,
            keywords, selected, rendered
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateClipCloudinary: exports.db.prepare(`
        UPDATE clips 
        SET cloudinary_public_id = ?, cloudinary_url = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `),
    getClipsByJob: exports.db.prepare(`
        SELECT * FROM clips 
        WHERE job_id = ? 
        ORDER BY clip_index ASC
    `),
    getSelectedClips: exports.db.prepare(`
        SELECT * FROM clips 
        WHERE job_id = ? AND selected = 1
        ORDER BY clip_index ASC
    `),
    updateClipSelection: exports.db.prepare(`
        UPDATE clips 
        SET selected = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `),
    getClipById: exports.db.prepare(`
        SELECT * FROM clips WHERE id = ?
    `),
    deleteClipsByJob: exports.db.prepare(`
        DELETE FROM clips WHERE job_id = ?
    `),
    countClipsByJob: exports.db.prepare(`
        SELECT COUNT(*) as count FROM clips WHERE job_id = ?
    `),
};
/**
 * Close database connection (for graceful shutdown)
 */
function closeDatabase() {
    exports.db.close();
    console.log('Database connection closed');
}
exports.default = exports.db;
