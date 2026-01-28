import { Hono } from 'hono';
import { supabase } from './supabase';
import { broadcastMatchScore, calculateWinRate, broadcastTournamentUpdate } from '@/lib/websocket';

const app = new Hono();

// ... (skipping lines)

// Broadcast Initial Score

// Broadcast Tournament Update (Match Started)

// Normalize Response

// --- CONSTANTS ---
export const PB_POINTS_TO_WIN = 11;
export const PB_WIN_BY = 2;

export const BADMINTON_POINTS_TO_WIN = 21;
export const BADMINTON_WIN_BY = 2; // Badminton requires winning by 2 points
export const BADMINTON_MAX_POINT = 30; // Max score in Badminton

// Legacy Exports for existing controllers (Defaulting to PB for now)
export const POINTS_TO_WIN = PB_POINTS_TO_WIN;
export const WIN_BY = PB_WIN_BY;

// --- TYPES ---

// Internal structure to track logical court positions
export interface TeamPositions {
    right_player_id: number; // Even Court
    left_player_id: number;  // Odd Court
}

// Pickleball Metadata Structure
export interface PickleballMetadata {
    team_a_pos: TeamPositions;
    team_b_pos: TeamPositions;
}

// Badminton Metadata Structure
// Badminton Metadata Structure (Harmonized with Pickleball)
interface BadmintonMetadata {
    sets: { a: number, b: number };
    serving_player_id: number;
    team_a_pos: TeamPositions;
    team_b_pos: TeamPositions;
}


// Input Payload Interface
interface StartMatchPayload {
    match_id: number;
    serving_team_id?: number;    // Required for Pickleball
    serving_player_id?: number;  // Required for Badminton
    positions: {
        pos_1: number; // Team A Right / Pos A Right
        pos_2: number; // Team A Left  / Pos A Left
        pos_3: number; // Team B Right / Pos B Right
        pos_4: number; // Team B Left  / Pos B Left
    }
}

// --- HELPERS ---

// Helper: Verify teams and return IDs strictly (A = Lower ID, B = Higher ID)
export async function getMatchContext(matchId: number) {
    // 1. Get Match Status & Pairing & Tournament
    const { data: match, error: mErr } = await supabase
        .from('matches')
        .select('id, status, round, tournament_id')
        .eq('id', matchId)
        .single();

    if (mErr || !match) throw new Error("Match not found or invalid ID");

    // 2. Fetch Game ID from Tournament
    const { data: tournament } = await supabase.from('tournaments').select('game_id').eq('id', match.tournament_id).single();
    // Default to 1 (Pickleball) if not found, or maybe generic
    const gameId = tournament?.game_id || 1;

    // 3. Get Pairing
    const { data: pairing, error: pErr } = await supabase
        .from('pairings')
        .select('id')
        .eq('match_id', matchId)
        .single();

    if (pErr || !pairing) throw new Error("Pairing configuration missing for this match");

    // 4. Get Teams
    const { data: teams, error: tErr } = await supabase
        .from('pairing_teams')
        .select('team_id')
        .eq('pairing_id', pairing.id)
        .order('team_id', { ascending: true }); // STRICT ORDERING

    if (tErr || !teams || teams.length !== 2) throw new Error("Invalid team configuration in DB");

    return {
        matchStatus: match.status,
        teamA_id: teams[0].team_id,
        teamB_id: teams[1].team_id,
        gameId: gameId,
        tournamentId: match.tournament_id,
        round: match.round
    };
}


// ============================================================================
// 1. START MATCH
// ============================================================================
app.post('/start', async (c) => {
    try {
        const body = await c.req.json() as StartMatchPayload;
        const { match_id, serving_team_id, serving_player_id, positions } = body;

        // 1. Validate Input Existence (Common)
        if (!match_id || !positions) {
            return c.json({ error: "Missing required fields (match_id, positions)" }, 400);
        }

        // 2. Validate Match Context
        const ctx = await getMatchContext(match_id);

        // 3. Validate Match Status
        if (ctx.matchStatus === 'completed') {
            return c.json({ error: "Match is already completed." }, 400);
        }
        if (ctx.matchStatus === 'in_progress') {
            // Optional: allow restart? Existing code said no.
            // return c.json({ error: "Match is already in progress. Cannot restart." }, 400);
        }

        // 4. Validate and Detect Team Sides
        const teamAMembers = await supabase.from('team_members').select('player_id').eq('team_id', ctx.teamA_id);
        const teamBMembers = await supabase.from('team_members').select('player_id').eq('team_id', ctx.teamB_id);

        if (!teamAMembers.data || !teamBMembers.data) return c.json({ error: "Failed to fetch team members" }, 500);

        const aIds = teamAMembers.data.map(m => m.player_id);
        const bIds = teamBMembers.data.map(m => m.player_id);

        const leftIds = [positions.pos_1, positions.pos_2];
        const rightIds = [positions.pos_3, positions.pos_4];

        let teamA_PosArr: number[];
        let teamB_PosArr: number[];
        let isAOnLeft = false;

        // Check if Left Side (Pos 1/2) corresponds to Team A
        if (leftIds.every(id => aIds.includes(id))) {
            isAOnLeft = true;
            teamA_PosArr = leftIds;
            // Expect Right Side to be Team B
            if (!rightIds.every(id => bIds.includes(id))) return c.json({ error: "Invalid Team B players on Right side" }, 400);
            teamB_PosArr = rightIds;
        } else if (leftIds.every(id => bIds.includes(id))) {
            // Left Side is Team B
            isAOnLeft = false;
            teamB_PosArr = leftIds;
            // Expect Right Side to be Team A
            if (!rightIds.every(id => aIds.includes(id))) return c.json({ error: "Invalid Team A players on Right side" }, 400);
            teamA_PosArr = rightIds;
        } else {
            return c.json({ error: "Left side players do not form a valid complete Team (within A or B)" }, 400);
        }

        // 5. Clean Slate
        const { error: delError } = await supabase.from('scores').delete().eq('match_id', match_id);
        if (delError) throw delError;

        let initialState: any;
        let finalServingTeamId: number = 0;

        // ---------------------------------------------------------
        // LOGIC BRANCH: PICKLEBALL (Game ID = 1)
        // ---------------------------------------------------------
        if (ctx.gameId === 1) {
            // ... [Assuming Pickleball might use same logic? It uses simpler metadata]
            // For now, let's keep PB simple or adapt if needed.
            // But existing PB logic assumes A=Left.
            // Let's dynamic PB too?
            if (!serving_team_id) return c.json({ error: "Pickleball requires serving_team_id" }, 400);
            finalServingTeamId = serving_team_id;

            const metadata: PickleballMetadata = {
                team_a_pos: { right_player_id: teamA_PosArr[0], left_player_id: teamA_PosArr[1] },
                team_b_pos: { right_player_id: teamB_PosArr[0], left_player_id: teamB_PosArr[1] }
            };
            // Note: PB meta uses pos1/2 indices, here [0][1]. [0] was Pos1/Pos3 (Top/Right-ish?).
            // Wait, pos_1 is Top. pos_2 is Bottom.
            // My logic: right=0, left=1?
            // Existing PB logic: right=pos_1, left=pos_2.
            // So yes: right=teamA_PosArr[0], left=teamA_PosArr[1]. Correct.

            const { data, error } = await supabase.from('scores').insert({
                match_id,
                team_a_score: 0,
                team_b_score: 0,
                serving_team_id,
                server_sequence: 2,
                metadata: metadata
            }).select().single();
            if (error) throw error;
            initialState = data;

            // ---------------------------------------------------------
            // LOGIC BRANCH: BADMINTON (Game ID = 2)
            // ---------------------------------------------------------
        } else if (ctx.gameId === 2) {
            if (!serving_player_id) return c.json({ error: "Badminton requires serving_player_id" }, 400);

            // Determine Serving Team
            if (aIds.includes(serving_player_id)) finalServingTeamId = ctx.teamA_id;
            else if (bIds.includes(serving_player_id)) finalServingTeamId = ctx.teamB_id;
            else return c.json({ error: "Serving player not found in either team" }, 400);

            // Asymmetric Start Positions
            let ta: TeamPositions;
            let tb: TeamPositions;

            // Helper to get partner from the team array
            // teamArr[0] = Top (Pos1/3), teamArr[1] = Bottom (Pos2/4)
            const getTeamPos = (isServing: boolean, teamArr: number[], teamId: number) => {
                const pTop = teamArr[0]; // Corresponds to pos_1 or pos_3
                const pBottom = teamArr[1]; // Corresponds to pos_2 or pos_4

                // Logic: A Server needs to be Bottom, B Server needs to be Top?
                // Wait, User Logic:
                // Team A(Left?): Server Bottom.
                // Team B(Right?): Server Top.
                // Does this logic depend on A/B ID? Or "Left Team" vs "Right Team"?
                // "Team A should serve at left bottom".
                // "Team B should serve at right top".
                // This implies Position-Based startup rules?
                // Or Team-ID based?
                // Given asymmetry, it's likely Team A is ALWAYS treated as "Host/Left" logic?
                // But if A is on Right...
                // Let's stick to Team ID logic for safety (A always A).

                // If Team A matches this teamArr:
                if (teamId === ctx.teamA_id) {
                    if (isServing) {
                        // A Serving: Server Bottom (Left logic). Partner Top.
                        // Bottom is teamArr[1].
                        // If serving player is Bottom, OK.
                        // If serving player is Top, SWAP them so serving player is Bottom?
                        // Or just assign struct?
                        // struct: Right=Top, Left=Bottom.
                        // If Server is Bottom. Left=Server. Right=Partner.
                        const srv = serving_player_id;
                        const partner = (srv === pTop) ? pBottom : pTop;
                        // Force Server to be 'Left' (Bottom).
                        return { right_player_id: partner, left_player_id: srv };
                    } else {
                        // A Not Serving: Default (Right=Top, Left=Bottom)
                        return { right_player_id: pTop, left_player_id: pBottom };
                    }
                } else {
                    // This is Team B
                    if (isServing) {
                        // B Serving: Server Top (Right logic). Partner Bottom.
                        // Top is teamArr[0].
                        // Force Server to be 'Right' (Top).
                        const srv = serving_player_id;
                        const partner = (srv === pTop) ? pBottom : pTop;
                        return { right_player_id: srv, left_player_id: partner };
                    } else {
                        return { right_player_id: pTop, left_player_id: pBottom };
                    }
                }
            };

            ta = getTeamPos(finalServingTeamId === ctx.teamA_id, teamA_PosArr, ctx.teamA_id);
            tb = getTeamPos(finalServingTeamId === ctx.teamB_id, teamB_PosArr, ctx.teamB_id);

            const metadata: BadmintonMetadata = {
                sets: { a: 0, b: 0 },
                serving_player_id: serving_player_id,
                team_a_pos: ta,
                team_b_pos: tb
            };

            const { data, error } = await supabase.from('scores').insert({
                match_id,
                team_a_score: 0,
                team_b_score: 0,
                serving_team_id: finalServingTeamId,
                server_sequence: null,
                metadata: metadata
            }).select().single();

            if (error) throw error;
            initialState = data;
        } else {
            return c.json({ error: "Unknown Game ID" }, 400);
        }

        // Update Match Status
        await supabase.from('matches').update({ status: 'in_progress', start_time: new Date().toISOString() }).eq('id', match_id);

        // Broadcast Tournament Update (Match Started)
        broadcastTournamentUpdate(ctx.tournamentId, 'match_start', {
            matchId: Number(match_id),
            status: 'in_progress',
            round: ctx.round
        });

        // Broadcast Initial Score
        broadcastMatchScore(Number(match_id), 0, 0, 50);

        // Normalize Response
        const response: any = {
            success: true,
            message: "Match Started",
            score_1_2: 0,
            score_3_4: 0,
            state: initialState,
            game_id: ctx.gameId
        };

        if (ctx.gameId === 2) {
            const meta = initialState.metadata as BadmintonMetadata;
            response.serving_player_id = meta.serving_player_id;
            response.sets = meta.sets;
        } else {
            response.server_seq = 2;
        }

        return c.json(response);

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

        if (!match_id || !rally_winner_team_id) {
            return c.json({ error: "Missing match_id or rally_winner_team_id" }, 400);
        }

        const ctx = await getMatchContext(match_id);

        if (ctx.matchStatus === 'completed') {
            return c.json({ error: "Match is finished. Cannot add points." }, 400);
        }

        if (rally_winner_team_id !== ctx.teamA_id && rally_winner_team_id !== ctx.teamB_id) {
            return c.json({ error: `Rally Winner Team ID ${rally_winner_team_id} does not belong to this match.` }, 400);
        }

        const { data: current, error } = await supabase
            .from('scores')
            .select('*')
            .eq('match_id', match_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !current) throw new Error("Match not started (No score history found)");

        // ---------------------------------------------------------
        // PICKLEBALL LOGIC
        // ---------------------------------------------------------
        if (ctx.gameId === 1) {
            let scoreA = current.team_a_score;
            let scoreB = current.team_b_score;
            let servingTeam = current.serving_team_id;
            let sequence = current.server_sequence;
            let metadata = current.metadata as PickleballMetadata;
            const isServerWinner = (servingTeam === rally_winner_team_id);

            if (isServerWinner) {
                if (servingTeam === ctx.teamA_id) {
                    scoreA++;
                    // Swap Team A (Right <-> Left)
                    const temp = metadata.team_a_pos.right_player_id;
                    metadata.team_a_pos.right_player_id = metadata.team_a_pos.left_player_id;
                    metadata.team_a_pos.left_player_id = temp;
                } else {
                    scoreB++;
                    // Swap Team B (Right <-> Left)
                    const temp = metadata.team_b_pos.right_player_id;
                    metadata.team_b_pos.right_player_id = metadata.team_b_pos.left_player_id;
                    metadata.team_b_pos.left_player_id = temp;
                }
                // Sequence remains same
            } else { // Side Out
                if (sequence === 1) {
                    sequence = 2; // Second server
                } else {
                    sequence = 1; // Hand over
                    servingTeam = (servingTeam === ctx.teamA_id) ? ctx.teamB_id : ctx.teamA_id;
                }
                // No score change, No position swap
            }

            const { error: insertErr } = await supabase.from('scores').insert({
                match_id,
                team_a_score: scoreA,
                team_b_score: scoreB,
                serving_team_id: servingTeam,
                server_sequence: sequence,
                metadata: metadata
            });

            if (insertErr) throw insertErr;

            // Check Win (Single Set Match)
            let matchComplete = false;
            let winnerId = null;
            if (scoreA >= PB_POINTS_TO_WIN && (scoreA - scoreB) >= PB_WIN_BY) { matchComplete = true; winnerId = ctx.teamA_id; }
            else if (scoreB >= PB_POINTS_TO_WIN && (scoreB - scoreA) >= PB_WIN_BY) { matchComplete = true; winnerId = ctx.teamB_id; }

            if (matchComplete) {
                await supabase.from('matches').update({ status: 'completed', winner_team_id: winnerId, end_time: new Date().toISOString() }).eq('id', match_id);
            }

            return c.json({
                data: {
                    success: true,
                    score_1_2: scoreA,
                    score_3_4: scoreB,
                    server_seq: sequence,
                    is_match_over: matchComplete,
                    winner_team_id: winnerId,
                    positions: {
                        pos_1: metadata.team_a_pos.left_player_id,
                        pos_2: metadata.team_a_pos.right_player_id,
                        pos_3: metadata.team_b_pos.left_player_id,
                        pos_4: metadata.team_b_pos.right_player_id
                    }
                }
            });

            // ---------------------------------------------------------
            // BADMINTON LOGIC
            // ---------------------------------------------------------
        } else if (ctx.gameId === 2) {
            const meta = current.metadata as any; // Cast to any to handle legacy structure
            let scoreA = current.team_a_score;
            let scoreB = current.team_b_score;
            let servingTeam = current.serving_team_id;
            let sets = { ...meta.sets };

            // Normalize Positions (Handle Legacy vs New Format)
            let team_a_pos: { right_player_id: number, left_player_id: number };
            let team_b_pos: { right_player_id: number, left_player_id: number };

            if (meta.team_a_pos) {
                // New Format exists
                team_a_pos = { ...meta.team_a_pos };
                team_b_pos = { ...meta.team_b_pos };
            } else if (meta.positions && meta.positions.a) {
                // Legacy Format exists -> Convert to New
                team_a_pos = { right_player_id: meta.positions.a.right, left_player_id: meta.positions.a.left };
                team_b_pos = { right_player_id: meta.positions.b.right, left_player_id: meta.positions.b.left };
            } else if (meta.positions && (meta.positions.pos_1 !== undefined)) {
                // Legacy Format B (Flat)
                team_a_pos = { right_player_id: meta.positions.pos_1, left_player_id: meta.positions.pos_2 };
                team_b_pos = { right_player_id: meta.positions.pos_3, left_player_id: meta.positions.pos_4 };
            } else {
                // Last ditch effort: maybe they are on root level?
                if (meta.pos_1 !== undefined) {
                    team_a_pos = { right_player_id: meta.pos_1, left_player_id: meta.pos_2 };
                    team_b_pos = { right_player_id: meta.pos_3, left_player_id: meta.pos_4 };
                } else {
                    // Fallback (Should not happen if data integrity is good)
                    throw new Error("Invalid metadata structure: missing positions");
                }
            }

            let servingPlayer = meta.serving_player_id;

            const isTeamAWinRally = (rally_winner_team_id === ctx.teamA_id);
            const isServerWinRally = (servingTeam === rally_winner_team_id);

            // 1. Award Point
            if (isTeamAWinRally) scoreA++; else scoreB++;

            // 2. Determine New Server and Positions
            if (isServerWinRally) {
                // Server's team won rally -> Swap POSITIONS (Left <-> Right)
                // Rule: If serving side wins a rally, the serving side scores a point and the SAME server serves again from the ALTERNATE service court.
                if (isTeamAWinRally) {
                    const temp = team_a_pos.right_player_id; team_a_pos.right_player_id = team_a_pos.left_player_id; team_a_pos.left_player_id = temp;
                } else {
                    const temp = team_b_pos.right_player_id; team_b_pos.right_player_id = team_b_pos.left_player_id; team_b_pos.left_player_id = temp;
                }
            } else {
                // Side out -> New Server based on score parity
                servingTeam = rally_winner_team_id;
                if (isTeamAWinRally) {
                    // Logic: A Even -> Bottom (Left), Odd -> Top (Right)
                    servingPlayer = (scoreA % 2 === 0) ? team_a_pos.left_player_id : team_a_pos.right_player_id;
                } else {
                    // Logic: B Even -> Top (Right), Odd -> Bottom (Left)
                    servingPlayer = (scoreB % 2 === 0) ? team_b_pos.right_player_id : team_b_pos.left_player_id;
                }
            }

            // 3. Check for Set Win
            let matchComplete = false;
            let winnerId = null;
            let setWon = false;

            const checkSetWin = (currentScore: number, opponentScore: number) => {
                if (currentScore >= BADMINTON_MAX_POINT) return true;
                if (currentScore >= BADMINTON_POINTS_TO_WIN && (currentScore - opponentScore) >= BADMINTON_WIN_BY) return true;
                return false;
            };

            if (checkSetWin(scoreA, scoreB)) {
                sets.a++;
                matchComplete = true; // SINGLE SET MATCH: End immediately on set win
                winnerId = ctx.teamA_id;
            } else if (checkSetWin(scoreB, scoreA)) {
                sets.b++;
                matchComplete = true; // SINGLE SET MATCH: End immediately on set win
                winnerId = ctx.teamB_id;
            }
            // Removed mutli-set logic (sets < 2 etc) as per user request for 1 set match.

            const newMeta: BadmintonMetadata = {
                sets,
                serving_player_id: servingPlayer,
                team_a_pos,
                team_b_pos
            };

            const { error: insertErr } = await supabase.from('scores').insert({
                match_id,
                team_a_score: scoreA,
                team_b_score: scoreB,
                serving_team_id: servingTeam,
                server_sequence: null,
                metadata: newMeta
            }).select()
                .single();

            if (insertErr) throw insertErr;

            if (matchComplete) {
                await supabase.from('matches').update({ status: 'completed', winner_team_id: winnerId, end_time: new Date().toISOString() }).eq('id', match_id);

                // Broadcast Match Completion
                broadcastTournamentUpdate(ctx.tournamentId, 'match_complete', {
                    matchId: Number(match_id),
                    status: 'completed',
                    winnerTeamId: winnerId,
                    round: ctx.round
                });
            }

            // Broadcast score update
            const winRate = calculateWinRate(scoreA, scoreB);
            broadcastMatchScore(Number(match_id), scoreA, scoreB, winRate);

            return c.json({
                data: {
                    success: true,
                    score_1_2: scoreA,
                    score_3_4: scoreB,
                    server_seq: null,
                    is_match_over: matchComplete,
                    winner_team_id: winnerId,
                    sets: sets,
                    serving_player_id: servingPlayer,
                    positions: {
                        pos_1: team_a_pos.right_player_id,
                        pos_2: team_a_pos.left_player_id,
                        pos_3: team_b_pos.right_player_id,
                        pos_4: team_b_pos.left_player_id
                    }
                }
            });
        } else {
            return c.json({ error: "Unknown Game ID" }, 400);
        }

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// ============================================================================
// 3. UNDO (With Status Revert)
// ============================================================================
app.post('/undo', async (c) => {
    try {
        const { match_id } = await c.req.json();
        if (!match_id) return c.json({ error: "Missing match_id" }, 400);

        // 1. Check Record Count
        const { count } = await supabase
            .from('scores')
            .select('*', { count: 'exact', head: true })
            .eq('match_id', match_id);

        if (count !== null && count <= 1) {
            return c.json({ error: "Cannot undo. Match is at start state." }, 400);
        }

        // 2. Get Latest ID to Delete
        const { data: latest } = await supabase
            .from('scores')
            .select('id')
            .eq('match_id', match_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!latest) {
            return c.json({ error: "No score found to undo" }, 404);
        }

        // 3. Delete Latest
        await supabase.from('scores').delete().eq('id', latest.id);

        // 4. Fetch NEW Current State (the state before the deleted one)
        const { data: current } = await supabase
            .from('scores')
            .select('*')
            .eq('match_id', match_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!current) {
            // This should ideally not happen if count > 1, but as a safeguard
            return c.json({ error: "No previous state found after undo" }, 500);
        }

        // 5. REVERT MATCH STATUS LOGIC
        // If match was completed, we need to check if it's STILL completed (usually not after undo)
        // Simple logic: Force in_progress if we undo.
        await supabase
            .from('matches')
            .update({
                status: 'in_progress',
                winner_team_id: null,
                end_time: null
            })
            .eq('id', match_id);

        const ctx = await getMatchContext(Number(match_id));

        // Broadcast Status Revert
        broadcastTournamentUpdate(ctx.tournamentId, 'match_update', {
            matchId: Number(match_id),
            status: 'in_progress',
            winnerTeamId: null,
            round: ctx.round
        });

        // Broadcast undo update
        const winRate = calculateWinRate(current.team_a_score, current.team_b_score);
        broadcastMatchScore(Number(match_id), current.team_a_score, current.team_b_score, winRate);

        const response: any = {
            success: true,
            score_1_2: current.team_a_score, // Integer score for Team A
            score_3_4: current.team_b_score, // Integer score for Team B
        };

        if (ctx.gameId === 2) {
            const meta = current.metadata as any;
            response.sets = meta.sets;
            response.serving_player_id = meta.serving_player_id;

            let team_a_pos: TeamPositions;
            let team_b_pos: TeamPositions;

            if (meta.team_a_pos) {
                team_a_pos = meta.team_a_pos;
                team_b_pos = meta.team_b_pos;
            } else if (meta.positions && meta.positions.a) {
                team_a_pos = { right_player_id: meta.positions.a.right, left_player_id: meta.positions.a.left };
                team_b_pos = { right_player_id: meta.positions.b.right, left_player_id: meta.positions.b.left };
            } else if (meta.positions && (meta.positions.pos_1 !== undefined)) {
                team_a_pos = { right_player_id: meta.positions.pos_2, left_player_id: meta.positions.pos_1 };
                team_b_pos = { right_player_id: meta.positions.pos_4, left_player_id: meta.positions.pos_3 };
            } else {
                if (meta.pos_1 !== undefined) {
                    team_a_pos = { right_player_id: meta.pos_2, left_player_id: meta.pos_1 };
                    team_b_pos = { right_player_id: meta.pos_4, left_player_id: meta.pos_3 };
                } else {
                    team_a_pos = { right_player_id: 0, left_player_id: 0 };
                    team_b_pos = { right_player_id: 0, left_player_id: 0 };
                }
            }

            response.positions = {
                pos_1: team_a_pos.right_player_id,
                pos_2: team_a_pos.left_player_id,
                pos_3: team_b_pos.right_player_id,
                pos_4: team_b_pos.left_player_id
            };
        } else {
            const meta = current.metadata as PickleballMetadata;
            response.server_seq = current.server_sequence;
            response.positions = {
                pos_1: meta.team_a_pos.left_player_id,
                pos_2: meta.team_a_pos.right_player_id,
                pos_3: meta.team_b_pos.left_player_id,
                pos_4: meta.team_b_pos.right_player_id
            };
        }

        return c.json({ data: response });

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// ============================================================================
// 4. GET MATCH STATE
// ============================================================================
app.get('/:id', async (c) => {
    const match_id = c.req.param('id');
    try {
        const { data: current } = await supabase
            .from('scores')
            .select('*')
            .eq('match_id', match_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!current) return c.json({ error: "No match data found" }, 404);

        const ctx = await getMatchContext(Number(match_id));

        const response: any = {
            ...current,
            score_1_2: current.team_a_score,
            score_3_4: current.team_b_score,
            gameId: ctx.gameId
        };

        if (ctx.gameId === 2) {
            const meta = current.metadata as any;
            console.log('DEBUG MATCH ID:', match_id);
            console.log('DEBUG METADATA RAW:', JSON.stringify(meta, null, 2));

            let team_a_pos: TeamPositions;
            let team_b_pos: TeamPositions;

            if (meta.team_a_pos) {
                console.log('Detected NEW format');
                team_a_pos = meta.team_a_pos;
                team_b_pos = meta.team_b_pos;
            } else if (meta.positions && meta.positions.a) {
                console.log('Detected LEGACY format A (Nested)');
                team_a_pos = { right_player_id: meta.positions.a.right, left_player_id: meta.positions.a.left };
                team_b_pos = { right_player_id: meta.positions.b.right, left_player_id: meta.positions.b.left };
            } else if (meta.positions && (meta.positions.pos_1 !== undefined)) {
                console.log('Detected LEGACY format B (Flat)');
                team_a_pos = { right_player_id: meta.positions.pos_1, left_player_id: meta.positions.pos_2 };
                team_b_pos = { right_player_id: meta.positions.pos_3, left_player_id: meta.positions.pos_4 };
            } else {
                console.log('Detected UNKNOWN format - Fallback to zeros');
                // Last ditch effort: maybe they are on root level?
                if (meta.pos_1 !== undefined) {
                    console.log('Detected ROOT format');
                    team_a_pos = { right_player_id: meta.pos_1, left_player_id: meta.pos_2 };
                    team_b_pos = { right_player_id: meta.pos_3, left_player_id: meta.pos_4 };
                } else {
                    team_a_pos = { right_player_id: 0, left_player_id: 0 };
                    team_b_pos = { right_player_id: 0, left_player_id: 0 };
                }
            }

            response.display_positions = {
                pos_1: team_a_pos.right_player_id,
                pos_2: team_a_pos.left_player_id,
                pos_3: team_b_pos.right_player_id,
                pos_4: team_b_pos.left_player_id
            };
            response.sets = meta.sets;
            response.serving_player_id = meta.serving_player_id;

            // Should also ensure response.metadata is normalized if frontend uses it?
            // Frontend uses matchState.metadata.team_a_pos (lines 208).
            // response spreads ...current, so response.metadata is effectively current.metadata.
            // If current.metadata is OLD, response.metadata is OLD.
            // We should explicitely OVERWRITE response.metadata with normalized version.
            response.metadata = {
                ...meta,
                team_a_pos,
                team_b_pos
            };
        } else {
            const meta = current.metadata as PickleballMetadata;
            response.display_positions = {
                pos_1: meta.team_a_pos.right_player_id,
                pos_2: meta.team_a_pos.left_player_id,
                pos_3: meta.team_b_pos.right_player_id,
                pos_4: meta.team_b_pos.left_player_id
            };
        }

        return c.json({ data: response });

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
