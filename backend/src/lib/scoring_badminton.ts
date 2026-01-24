import { Hono } from 'hono';
import { supabase } from './supabase';
import { broadcastMatchScore, calculateWinRate } from '@/lib/websocket';

const app = new Hono();

// --- CONSTANTS ---
const POINTS_TO_WIN = 21;
const WIN_BY = 1; // User requested change from 2 to 1
const MAX_POINT = 30; // Safety cap

// --- TYPES ---
interface BadmintonState {
    sets: { a: number, b: number };
    serving_player_id: number;
    positions: {
        a: { right: number, left: number };
        b: { right: number, left: number };
    };
}

interface StartMatchPayload {
    match_id: number;
    serving_player_id: number; // User changed from serving_team_id
    // Initial positions (IDs)
    positions: {
        pos_a_right: number;
        pos_a_left: number;
        pos_b_right: number;
        pos_b_left: number;
    };
}

// --- HELPERS ---

// Helper: Verify teams and return IDs (A = Lower ID, B = Higher ID)
async function getMatchContext(matchId: number) {
    const { data: match } = await supabase.from('matches').select('id, status, tournament_id').eq('id', matchId).single();
    if (!match) throw new Error("Match not found");

    // Fetch Game ID from Tournament
    const { data: tournament } = await supabase.from('tournaments').select('game_id').eq('id', match.tournament_id).single();
    const gameId = tournament?.game_id;

    const { data: pairing } = await supabase.from('pairings').select('id').eq('match_id', matchId).single();
    if (!pairing) throw new Error("Pairing not found");

    const { data: teams } = await supabase
        .from('pairing_teams')
        .select('team_id')
        .eq('pairing_id', pairing.id)
        .order('team_id', { ascending: true }); // A first, B second

    if (!teams || teams.length !== 2) throw new Error("Invalid teams");

    return {
        matchStatus: match.status,
        teamA_id: teams[0].team_id,
        teamB_id: teams[1].team_id,
        gameId: gameId // 1=Pickleball, 2=Badminton
    };
}

// ============================================================================
// 0. INIT / FETCH CONTEXT (Helper for UI)
// ============================================================================
app.get('/init/:id', async (c) => {
    try {
        const match_id = c.req.param('id');
        const ctx = await getMatchContext(Number(match_id));

        // Fetch Players for these teams to let UI pre-fill
        const { data: members } = await supabase
            .from('team_members')
            .select('team_id, player_id, players(username)')
            .in('team_id', [ctx.teamA_id, ctx.teamB_id]);

        const teamA_players = members?.filter(m => m.team_id === ctx.teamA_id).map(m => ({
            id: m.player_id,
            name: Array.isArray(m.players) ? m.players[0]?.username : (m.players as any)?.username
        })) || [];
        const teamB_players = members?.filter(m => m.team_id === ctx.teamB_id).map(m => ({
            id: m.player_id,
            name: Array.isArray(m.players) ? m.players[0]?.username : (m.players as any)?.username
        })) || [];

        return c.json({
            success: true,
            teamA: { id: ctx.teamA_id, players: teamA_players },
            teamB: { id: ctx.teamB_id, players: teamB_players },
            gameId: ctx.gameId
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// ============================================================================
// 1. START MATCH
// ============================================================================
app.post('/start', async (c) => {
    try {
        const body = await c.req.json() as StartMatchPayload;
        const { match_id, serving_player_id, positions } = body;
        const mid = Number(match_id);

        const ctx = await getMatchContext(match_id);

        if (ctx.gameId === 1) {
            return c.json({ success: false, is_pickleball: true, message: "Pickleball!" });
        }

        if (ctx.matchStatus === 'completed') return c.json({ error: 'Match completed' }, 400);

        // Determine Serving Team from Player ID
        let serving_team_id: number;
        if (serving_player_id === positions.pos_a_right || serving_player_id === positions.pos_a_left) {
            serving_team_id = ctx.teamA_id;
        } else if (serving_player_id === positions.pos_b_right || serving_player_id === positions.pos_b_left) {
            serving_team_id = ctx.teamB_id;
        } else {
            return c.json({ error: "Serving player must be one of the positioned players" }, 400);
        }

        // Clear existing
        await supabase.from('scores').delete().eq('match_id', match_id);

        const metadata: BadmintonState = {
            sets: { a: 0, b: 0 },
            serving_player_id: serving_player_id,
            positions: {
                a: { right: positions.pos_a_right, left: positions.pos_a_left },
                b: { right: positions.pos_b_right, left: positions.pos_b_left }
            }
        };

        const { data, error } = await supabase.from('scores').insert({
            match_id,
            team_a_score: 0,
            team_b_score: 0,
            serving_team_id: serving_team_id,
            server_sequence: null,   // Explicitly null for Badminton
            metadata: metadata
        }).select().single();

        if (error) throw error;

        await supabase.from('matches').update({ status: 'in_progress', start_time: new Date().toISOString() }).eq('id', match_id);

        // Broadcast initial score
        broadcastMatchScore(mid, 0, 0, 50);

        // Return same structure as /point so UI works immediately
        return c.json({
            success: true,
            score_1_2: 0,
            score_3_4: 0,
            server_seq: null,
            is_match_over: false,
            winner_team_id: null,
            sets: { a: 0, b: 0 },
            serving_player_id: serving_player_id,
            positions: {
                pos_1: positions.pos_a_right,
                pos_2: positions.pos_a_left,
                pos_3: positions.pos_b_right,
                pos_4: positions.pos_b_left
            }
        });

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// ============================================================================
// 2. RECORD POINT
// ============================================================================
app.post('/point', async (c) => {
    try {
        const { match_id, rally_winner_team_id } = await c.req.json();
        const mid = Number(match_id);
        const ctx = await getMatchContext(match_id);

        if (ctx.gameId === 1) {
            return c.json({ success: false, is_pickleball: true, message: "Pickleball!" });
        }

        // Get Latest State
        const { data: current, error } = await supabase
            .from('scores')
            .select('*')
            .eq('match_id', match_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!current) return c.json({ error: "Match not started" }, 400);

        // Prepare Next State
        const meta = current.metadata as BadmintonState;
        let scoreA = current.team_a_score;
        let scoreB = current.team_b_score;
        let servingTeam = current.serving_team_id;
        let sets = { ...meta.sets };
        let positions = JSON.parse(JSON.stringify(meta.positions)); // Deep copy
        let servingPlayer = meta.serving_player_id;

        // --- GAME LOGIC ---
        const isTeamAWin = (rally_winner_team_id === ctx.teamA_id);
        const isServerWin = (servingTeam === rally_winner_team_id);

        // 1. Point Update
        if (isTeamAWin) scoreA++; else scoreB++;

        // 2. Rotation / Server Update
        if (isServerWin) {
            // Serving team won -> Swap courts, Same server
            if (isTeamAWin) {
                // Swap A
                const temp = positions.a.right;
                positions.a.right = positions.a.left;
                positions.a.left = temp;
            } else {
                // Swap B
                const temp = positions.b.right;
                positions.b.right = positions.b.left;
                positions.b.left = temp;
            }
        } else {
            // Side Out -> No Swap, Change Team, Check Score for Server
            servingTeam = rally_winner_team_id;

            const newScore = isTeamAWin ? scoreA : scoreB;
            const isEven = (newScore % 2 === 0);

            if (isTeamAWin) {
                servingPlayer = isEven ? positions.a.right : positions.a.left;
            } else {
                servingPlayer = isEven ? positions.b.right : positions.b.left;
            }
        }

        // 3. Set Logic
        let matchComplete = false;
        let winnerId = null;

        const checkWin = (s1: number, s2: number) => {
            if (s1 >= POINTS_TO_WIN && (s1 - s2) >= WIN_BY) return true;
            if (s1 >= MAX_POINT) return true;
            return false;
        };

        if (checkWin(scoreA, scoreB)) {
            sets.a++;
            // Reset for next set if match continues
            if (sets.a < 2 && sets.b < 2) {
                scoreA = 0;
                scoreB = 0;
                // Winner serves first in next set
                servingTeam = ctx.teamA_id;
                // Reset positions (Optional, but clean)
                // positions = ... (Keep current positions or reset? Standard is usually keep or user can move)
                // Let's keep positions but determine server based on Right/Left rule for 0-0
                // 0-0 is Even, so Right player serves.
                servingPlayer = positions.a.right;
            }
        } else if (checkWin(scoreB, scoreA)) {
            sets.b++;
            if (sets.a < 2 && sets.b < 2) {
                scoreA = 0;
                scoreB = 0;
                servingTeam = ctx.teamB_id;
                servingPlayer = positions.b.right;
            }
        }

        if (sets.a >= 2) { matchComplete = true; winnerId = ctx.teamA_id; }
        if (sets.b >= 2) { matchComplete = true; winnerId = ctx.teamB_id; }

        if (matchComplete) {
            await supabase.from('matches').update({ status: 'completed', winner_team_id: winnerId, end_time: new Date().toISOString() }).eq('id', match_id);
        }

        // 4. Persistence
        const newMeta: BadmintonState = {
            sets,
            serving_player_id: servingPlayer,
            positions
        };

        const { data: newState, error: insertErr } = await supabase.from('scores').insert({
            match_id,
            team_a_score: scoreA,
            team_b_score: scoreB,
            serving_team_id: servingTeam,
            server_sequence: null,
            metadata: newMeta
        }).select().single();

        if (insertErr) throw insertErr;

        // Broadcast score update
        const winRate = calculateWinRate(scoreA, scoreB);
        broadcastMatchScore(mid, scoreA, scoreB, winRate);

        return c.json({
            success: true,
            // Match scoring.ts output format
            score_1_2: scoreA,
            score_3_4: scoreB,
            server_seq: null, // Not used in Badminton
            is_match_over: matchComplete,
            winner_team_id: winnerId,
            // Extra Badminton specific fields
            sets: sets,
            serving_player_id: servingPlayer,
            // Flatted positions for frontend consistency (pos_1..4)
            positions: {
                pos_1: positions.a.right,
                pos_2: positions.a.left,
                pos_3: positions.b.right,
                pos_4: positions.b.left
            }
        });

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// ============================================================================
// 3. UNDO
// ============================================================================
app.post('/undo', async (c) => {
    try {
        const { match_id } = await c.req.json();
        const mid = Number(match_id);

        // Check count
        const { count } = await supabase.from('scores').select('*', { count: 'exact', head: true }).eq('match_id', match_id);
        if (count !== null && count <= 1) return c.json({ error: "Cannot undo start" }, 400);

        // Get Latest
        const { data: latest } = await supabase.from('scores').select('id').eq('match_id', match_id).order('created_at', { ascending: false }).limit(1).single();
        if (latest) await supabase.from('scores').delete().eq('id', latest.id);

        // Get New Status (Previous)
        const { data: current } = await supabase.from('scores').select('*').eq('match_id', match_id).order('created_at', { ascending: false }).limit(1).single();

        // Revert Match Completion if needed
        await supabase.from('matches').update({ status: 'in_progress', winner_team_id: null, end_time: null }).eq('id', match_id);

        // Broadcast undo update
        const winRate = calculateWinRate(current.team_a_score, current.team_b_score);
        broadcastMatchScore(mid, current.team_a_score, current.team_b_score, winRate);

        return c.json({ success: true, state: current });

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
