"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queries = exports.supabase = void 0;
exports.closeDatabase = closeDatabase;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
    process.exit(1);
}
// Create Supabase client (service role — full access)
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
console.log('✅ Supabase client initialized');
console.log(`📡 URL: ${supabaseUrl}`);
/**
 * Async query helpers that mirror the old synchronous `queries` API.
 * Each method returns the data directly (throws on error).
 */
exports.queries = {
    // ── Jobs ─────────────────────────────────────────────────────────────
    async insertJob(id, status, progress, videoPath, audioPath, transcriptPath) {
        const { error } = await exports.supabase.from('jobs').upsert({
            id, status, progress,
            video_path: videoPath,
            audio_path: audioPath,
            transcript_path: transcriptPath,
        }, { onConflict: 'id' });
        if (error)
            throw new Error(`insertJob failed: ${error.message}`);
    },
    async getJob(id) {
        const { data, error } = await exports.supabase
            .from('jobs')
            .select('*')
            .eq('id', id)
            .single();
        if (error && error.code !== 'PGRST116')
            throw new Error(`getJob failed: ${error.message}`);
        return data;
    },
    async updateJobStatus(status, progress, id) {
        const { error } = await exports.supabase
            .from('jobs')
            .update({ status, progress })
            .eq('id', id);
        if (error)
            throw new Error(`updateJobStatus failed: ${error.message}`);
    },
    async updateJobError(errorMsg, id) {
        const { error } = await exports.supabase
            .from('jobs')
            .update({ status: 'failed', error: errorMsg })
            .eq('id', id);
        if (error)
            throw new Error(`updateJobError failed: ${error.message}`);
    },
    // ── Clips ────────────────────────────────────────────────────────────
    async insertClip(id, jobId, clipIndex, videoPath, startTime, endTime, duration, text, scoreTotal, scoreDuration, scoreKeyword, scoreCompleteness, keywords, selected, rendered) {
        const { error } = await exports.supabase.from('clips').upsert({
            id, job_id: jobId, clip_index: clipIndex, video_path: videoPath,
            start_time: startTime, end_time: endTime, duration, text,
            score_total: scoreTotal, score_duration: scoreDuration,
            score_keyword: scoreKeyword, score_completeness: scoreCompleteness,
            keywords, selected: selected === 1, rendered: rendered === 1,
        }, { onConflict: 'job_id,clip_index' });
        if (error)
            throw new Error(`insertClip failed: ${error.message}`);
    },
    async getClipsByJob(jobId) {
        const { data, error } = await exports.supabase
            .from('clips')
            .select('*')
            .eq('job_id', jobId)
            .order('clip_index', { ascending: true });
        if (error)
            throw new Error(`getClipsByJob failed: ${error.message}`);
        return data || [];
    },
    async getSelectedClips(jobId) {
        const { data, error } = await exports.supabase
            .from('clips')
            .select('*')
            .eq('job_id', jobId)
            .eq('selected', true)
            .order('clip_index', { ascending: true });
        if (error)
            throw new Error(`getSelectedClips failed: ${error.message}`);
        return data || [];
    },
    async updateClipSelection(selected, id) {
        const { error } = await exports.supabase
            .from('clips')
            .update({ selected: selected === 1 })
            .eq('id', id);
        if (error)
            throw new Error(`updateClipSelection failed: ${error.message}`);
    },
    async getClipById(id) {
        const { data, error } = await exports.supabase
            .from('clips')
            .select('*')
            .eq('id', id)
            .single();
        if (error && error.code !== 'PGRST116')
            throw new Error(`getClipById failed: ${error.message}`);
        return data;
    },
    async deleteClipsByJob(jobId) {
        const { error } = await exports.supabase
            .from('clips')
            .delete()
            .eq('job_id', jobId);
        if (error)
            throw new Error(`deleteClipsByJob failed: ${error.message}`);
    },
    async countClipsByJob(jobId) {
        const { count, error } = await exports.supabase
            .from('clips')
            .select('*', { count: 'exact', head: true })
            .eq('job_id', jobId);
        if (error)
            throw new Error(`countClipsByJob failed: ${error.message}`);
        return { count: count || 0 };
    },
    async deleteJob(jobId) {
        const { error } = await exports.supabase
            .from('jobs')
            .delete()
            .eq('id', jobId);
        if (error)
            throw new Error(`deleteJob failed: ${error.message}`);
    },
    async updateClipVideoPath(videoPath, id) {
        const { error } = await exports.supabase
            .from('clips')
            .update({
            video_path: videoPath,
            updated_at: new Date().toISOString(),
        })
            .eq('id', id);
        if (error)
            throw new Error(`updateClipVideoPath failed: ${error.message}`);
    },
};
/**
 * Close database connection (no-op for Supabase — HTTP based)
 */
function closeDatabase() {
    console.log('Supabase connection closed (HTTP — no persistent connection)');
}
exports.default = exports.supabase;
