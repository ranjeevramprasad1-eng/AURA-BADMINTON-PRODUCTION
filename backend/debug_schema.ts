
import { createClient } from '@supabase/supabase-js';

const url = Bun.env.SUPABASE_URL!;
const key = Bun.env.SUPABASE_ANON_KEY!;
const supabase = createClient(url, key);

async function checkSchema() {
    console.log("Checking tournaments table schema...");

    // Fetch one tournament to see keys
    const { data: tourney, error } = await supabase.from('tournaments').select('*').limit(1).single();
    if (error) { console.error('Error:', error); return; }

    console.log('Tournament Keys:', Object.keys(tourney));
    console.log('Sample Row:', tourney);
}

checkSchema();
