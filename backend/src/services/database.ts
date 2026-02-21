import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
    process.exit(1);
}

// Create Supabase client (service role — full access)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

console.log('✅ Supabase client initialized');
console.log(`📡 URL: ${supabaseUrl}`);

/**
 * Async query helpers that mirror the old synchronous `queries` API.
 * Each method returns the data directly (throws on error).
 */
export const queries = {
    // ── Jobs ─────────────────────────────────────────────────────────────

    async insertJob(id: string, status: string, progress: number, videoPath: string, audioPath: string | null, transcriptPath: string | null) {
        const { error } = await supabase.from('jobs').upsert({
            id, status, progress,
            video_path: videoPath,
            audio_path: audioPath,
            transcript_path: transcriptPath,
        }, { onConflict: 'id' });
        if (error) throw new Error(`insertJob failed: ${error.message}`);
    },

    async getJob(id: string) {
        const { data, error } = await supabase
            .from('jobs')
            .select('*')
            .eq('id', id)
            .single();
        if (error && error.code !== 'PGRST116') throw new Error(`getJob failed: ${error.message}`);
        return data;
    },

    async updateJobStatus(status: string, progress: number, id: string) {
        const { error } = await supabase
            .from('jobs')
            .update({ status, progress })
            .eq('id', id);
        if (error) throw new Error(`updateJobStatus failed: ${error.message}`);
    },

    async updateJobError(errorMsg: string, id: string) {
        const { error } = await supabase
            .from('jobs')
            .update({ status: 'failed', error: errorMsg })
            .eq('id', id);
        if (error) throw new Error(`updateJobError failed: ${error.message}`);
    },

    // ── Clips ────────────────────────────────────────────────────────────

    async insertClip(
        id: string, jobId: string, clipIndex: number, videoPath: string,
        cloudinaryPublicId: string | null, cloudinaryUrl: string | null,
        startTime: number, endTime: number, duration: number, text: string,
        scoreTotal: number | null, scoreDuration: number | null,
        scoreKeyword: number | null, scoreCompleteness: number | null,
        keywords: string | null, selected: number, rendered: number
    ) {
        const { error } = await supabase.from('clips').upsert({
            id, job_id: jobId, clip_index: clipIndex, video_path: videoPath,
            cloudinary_public_id: cloudinaryPublicId, cloudinary_url: cloudinaryUrl,
            start_time: startTime, end_time: endTime, duration, text,
            score_total: scoreTotal, score_duration: scoreDuration,
            score_keyword: scoreKeyword, score_completeness: scoreCompleteness,
            keywords, selected: selected === 1, rendered: rendered === 1,
        }, { onConflict: 'job_id,clip_index' });
        if (error) throw new Error(`insertClip failed: ${error.message}`);
    },

    async updateClipCloudinary(publicId: string, url: string, id: string) {
        const { error } = await supabase
            .from('clips')
            .update({ cloudinary_public_id: publicId, cloudinary_url: url })
            .eq('id', id);
        if (error) throw new Error(`updateClipCloudinary failed: ${error.message}`);
    },

    async getClipsByJob(jobId: string) {
        const { data, error } = await supabase
            .from('clips')
            .select('*')
            .eq('job_id', jobId)
            .order('clip_index', { ascending: true });
        if (error) throw new Error(`getClipsByJob failed: ${error.message}`);
        return data || [];
    },

    async getSelectedClips(jobId: string) {
        const { data, error } = await supabase
            .from('clips')
            .select('*')
            .eq('job_id', jobId)
            .eq('selected', true)
            .order('clip_index', { ascending: true });
        if (error) throw new Error(`getSelectedClips failed: ${error.message}`);
        return data || [];
    },

    async updateClipSelection(selected: number, id: string) {
        const { error } = await supabase
            .from('clips')
            .update({ selected: selected === 1 })
            .eq('id', id);
        if (error) throw new Error(`updateClipSelection failed: ${error.message}`);
    },

    async getClipById(id: string) {
        const { data, error } = await supabase
            .from('clips')
            .select('*')
            .eq('id', id)
            .single();
        if (error && error.code !== 'PGRST116') throw new Error(`getClipById failed: ${error.message}`);
        return data;
    },

    async deleteClipsByJob(jobId: string) {
        const { error } = await supabase
            .from('clips')
            .delete()
            .eq('job_id', jobId);
        if (error) throw new Error(`deleteClipsByJob failed: ${error.message}`);
    },

    async countClipsByJob(jobId: string) {
        const { count, error } = await supabase
            .from('clips')
            .select('*', { count: 'exact', head: true })
            .eq('job_id', jobId);
        if (error) throw new Error(`countClipsByJob failed: ${error.message}`);
        return { count: count || 0 };
    },

    async deleteJob(jobId: string) {
        const { error } = await supabase
            .from('jobs')
            .delete()
            .eq('id', jobId);
        if (error) throw new Error(`deleteJob failed: ${error.message}`);
    },

    async updateClipVideoPath(videoPath: string, id: string) {
        // Clear Cloudinary fields — the fresh local render is now authoritative.
        // buildVideoUrl() prefers cloudinary_url, so leaving it would serve the OLD video.
        const { error } = await supabase
            .from('clips')
            .update({
                video_path: videoPath,
                cloudinary_url: null,
                cloudinary_public_id: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);
        if (error) throw new Error(`updateClipVideoPath failed: ${error.message}`);
    },
};

/**
 * Close database connection (no-op for Supabase — HTTP based)
 */
export function closeDatabase() {
    console.log('Supabase connection closed (HTTP — no persistent connection)');
}

export default supabase;
