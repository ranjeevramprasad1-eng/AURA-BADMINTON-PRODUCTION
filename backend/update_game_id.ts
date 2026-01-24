
import { createClient } from '@supabase/supabase-js';

const url = Bun.env.SUPABASE_URL!;
const key = Bun.env.SUPABASE_ANON_KEY!;
const supabase = createClient(url, key);

async function setBadmintonGameId() {
    console.log("Setting Tournament 22 (from previous debug) to Game ID 2 (Badminton)...");

    // 1. Update Tournament
    const { error } = await supabase
        .from('tournaments')
        .update({ game_id: 2 })
        .eq('id', 22);

    if (error) console.error("Error updating tournament:", error);
    else console.log("Success! Tournament 22 is now Badminton (Game ID 2).");

    // 2. Also check if there's a generic 'Badminton' game in 'games' table if needed, 
    // but the logic relies on the ID integer directly, so this update is sufficient.
}

setBadmintonGameId();
