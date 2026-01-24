
import { createClient } from '@supabase/supabase-js';

const url = Bun.env.SUPABASE_URL!;
const key = Bun.env.SUPABASE_ANON_KEY!;
const supabase = createClient(url, key);

async function findValidMatch() {
    console.log("Searching for a valid match (2 teams)...");

    // Get a few matches
    const { data: matches } = await supabase.from('matches')
        .select('id, status')
        .neq('status', 'bye')
        .order('id', { ascending: false })
        .limit(20);

    if (!matches) { console.log('No matches found'); return; }

    for (const m of matches) {
        // Check pairing teams
        const { data: pairing } = await supabase.from('pairings').select('id').eq('match_id', m.id).single();
        if (!pairing) continue;

        const { count } = await supabase.from('pairing_teams').select('*', { count: 'exact', head: true }).eq('pairing_id', pairing.id);

        if (count === 2) {
            console.log(`✅ FOUND VALID MATCH: ID ${m.id} (Status: ${m.status})`);
            return;
        }
    }
    console.log("No valid 2-team matches found in recent 20.");
}

findValidMatch();
