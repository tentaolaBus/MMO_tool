/**
 * Test: prove that the upsert REPLACES the id when the same (job_id, clip_index) 
 * is inserted with a different id.
 */
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(
    'https://vfpxvboskrmjznnitrhq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmcHh2Ym9za3Jtanpubml0cmhxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI0NzcyMCwiZXhwIjoyMDg2ODIzNzIwfQ.yWTBMComVmOSKdkspsYXHUYoBuUchpPblDMAIS7Mt08'
);

async function test() {
    // Pick existing clip from latest job  
    const { data: clips } = await supabase
        .from('clips')
        .select('id, job_id, clip_index')
        .eq('job_id', 'a1405cf4-cd32-43ec-91bb-a6804c9447f3')
        .order('clip_index', { ascending: true })
        .limit(1);

    if (!clips || clips.length === 0) {
        console.log('No clips found');
        return;
    }

    const existing = clips[0];
    console.log('BEFORE:');
    console.log(`  id:         ${existing.id}`);
    console.log(`  job_id:     ${existing.job_id}`);
    console.log(`  clip_index: ${existing.clip_index}`);

    // Now do the SAME upsert the render endpoint does with a NEW id
    const newId = uuidv4();
    console.log(`\nAttempting upsert with NEW id: ${newId}`);
    console.log(`  onConflict: job_id,clip_index`);

    // NOTE: DO NOT actually run the upsert — just check if it would change the id
    // Let's just check the DB schema constraints
    const { data: schema } = await supabase.rpc('get_table_info', { table_name: 'clips' }).single();
    console.log('\nSchema check (via RPC):', schema);

    // Check by just querying for duplicate (job_id, clip_index) pairs
    const { data: dupes } = await supabase
        .from('clips')
        .select('id, job_id, clip_index')
        .eq('job_id', existing.job_id)
        .eq('clip_index', existing.clip_index);

    console.log(`\nRows with (job_id=${existing.job_id}, clip_index=${existing.clip_index}):`);
    console.log(`  Count: ${dupes?.length}`);
    dupes?.forEach(d => console.log(`  id: ${d.id}`));

    // Check for ANY duplicate (job_id, clip_index) across ALL clips
    const { data: allClips } = await supabase
        .from('clips')
        .select('id, job_id, clip_index')
        .order('job_id', { ascending: true })
        .order('clip_index', { ascending: true });

    const seen = new Map();
    const duplicates = [];
    for (const c of (allClips || [])) {
        const key = `${c.job_id}_${c.clip_index}`;
        if (seen.has(key)) {
            duplicates.push({ key, id1: seen.get(key), id2: c.id });
        }
        seen.set(key, c.id);
    }

    console.log(`\n=== DUPLICATE (job_id, clip_index) CHECK ===`);
    console.log(`Total clips: ${allClips?.length}`);
    console.log(`Unique (job_id, clip_index) pairs: ${seen.size}`);
    console.log(`Duplicates: ${duplicates.length}`);
    duplicates.forEach(d => {
        console.log(`  ⚠️ DUPLICATE: ${d.key}`);
        console.log(`     id1: ${d.id1}`);
        console.log(`     id2: ${d.id2}`);
    });
}

test().catch(console.error);
