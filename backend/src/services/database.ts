import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database path
const dbPath = path.resolve('./storage/app.db');

// Ensure storage directory exists
const storageDir = path.dirname(dbPath);
if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
}

// Create database connection
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

/**
 * Initialize database schema
 * MUST be called before any queries are executed
 */
export function initDatabase() {
    console.log('Initializing database schema...');
    console.log('Database path:', dbPath);

    try {
        db.exec(`
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
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log('📋 Tables:', tables.map((t: any) => t.name).join(', '));

    } catch (error) {
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
export const queries = {
    // Jobs
    insertJob: db.prepare(`
        INSERT INTO jobs (id, status, progress, video_path, audio_path, transcript_path)
        VALUES (?, ?, ?, ?, ?, ?)
    `),

    getJob: db.prepare(`
        SELECT * FROM jobs WHERE id = ?
    `),

    updateJobStatus: db.prepare(`
        UPDATE jobs 
        SET status = ?, progress = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `),

    updateJobError: db.prepare(`
        UPDATE jobs 
        SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `),

    // Clips
    insertClip: db.prepare(`
        INSERT OR REPLACE INTO clips (
            id, job_id, clip_index, video_path,
            start_time, end_time, duration, text,
            score_total, score_duration, score_keyword, score_completeness,
            keywords, selected, rendered
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    getClipsByJob: db.prepare(`
        SELECT * FROM clips 
        WHERE job_id = ? 
        ORDER BY clip_index ASC
    `),

    getSelectedClips: db.prepare(`
        SELECT * FROM clips 
        WHERE job_id = ? AND selected = 1
        ORDER BY clip_index ASC
    `),

    updateClipSelection: db.prepare(`
        UPDATE clips 
        SET selected = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `),

    getClipById: db.prepare(`
        SELECT * FROM clips WHERE id = ?
    `),

    deleteClipsByJob: db.prepare(`
        DELETE FROM clips WHERE job_id = ?
    `),

    countClipsByJob: db.prepare(`
        SELECT COUNT(*) as count FROM clips WHERE job_id = ?
    `),
};

/**
 * Close database connection (for graceful shutdown)
 */
export function closeDatabase() {
    db.close();
    console.log('Database connection closed');
}

export default db;
