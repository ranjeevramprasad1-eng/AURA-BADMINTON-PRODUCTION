import { Hono } from "hono";
import { supabase } from "./supabase";
import {
  broadcastMatchScore,
  calculateWinRate,
  broadcastTournamentUpdate,
} from "@/lib/websocket";
import {
  update_player_ratings_in_db,
  revert_player_ratings_for_match,
} from "./rating_calculations";

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

export const PICKLEBALL_METADATA = {
  POINTS_TO_WIN: PB_POINTS_TO_WIN,
  WIN_BY: PB_WIN_BY,
};

export const BADMINTON_METADATA = {
  POINTS_TO_WIN: BADMINTON_POINTS_TO_WIN,
  WIN_BY: BADMINTON_WIN_BY,
  MAX_POINT: BADMINTON_MAX_POINT,
};

// --- TYPES ---

// Internal structure to track logical court positions
export interface TeamPositions {
  right_player_id: number; // Even Court
  left_player_id: number; // Odd Court
}

// Pickleball Metadata Structure
export interface PickleballMetadata {
  team_a_pos: TeamPositions;
  team_b_pos: TeamPositions;
  positions?: StoredPositions; // client's placement; preserved and returned as-is
}

// Stored court positions (pos_1..pos_4) as sent by client — preserved for response/display
export interface StoredPositions {
  pos_1: number;
  pos_2: number;
  pos_3: number;
  pos_4: number;
}

// Badminton Metadata Structure
// Badminton Metadata Structure (Harmonized with Pickleball)
interface BadmintonMetadata {
  sets: { a: number; b: number };
  serving_player_id: number;
  team_a_pos: TeamPositions;
  team_b_pos: TeamPositions;
  positions?: StoredPositions; // client's placement; preserved and returned as-is
  /** When true, pos_1/pos_2 = Team A (left court). When false, pos_1/pos_2 = Team B (Team A on right court). */
  team_a_on_left_court?: boolean;
}

// Input Payload Interface
interface StartMatchPayload {
  match_id: number;
  serving_team_id?: number; // Required for Pickleball
  serving_player_id?: number; // Required for Badminton
  positions: {
    pos_1: number; // Team A Right / Pos A Right
    pos_2: number; // Team A Left  / Pos A Left
    pos_3: number; // Team B Right / Pos B Right
    pos_4: number; // Team B Left  / Pos B Left
  };
}

// --- HELPERS ---

// True when metadata has stored court positions (pos_1..pos_4) to return as-is
function hasStoredPositions(meta: any): meta is { positions: StoredPositions } {
  const p = meta?.positions;
  return (
    p &&
    typeof p.pos_1 === "number" &&
    typeof p.pos_2 === "number" &&
    typeof p.pos_3 === "number" &&
    typeof p.pos_4 === "number"
  );
}

// Swap left/right positions in place (server's team won — alternate service court)
function swapPositions(pos: TeamPositions): void {
  const temp = pos.right_player_id;
  pos.right_player_id = pos.left_player_id;
  pos.left_player_id = temp;
}

function checkBadmintonSetWin(
  currentScore: number,
  opponentScore: number,
): boolean {
  if (currentScore >= BADMINTON_MAX_POINT) return true;
  return (
    currentScore >= BADMINTON_POINTS_TO_WIN &&
    currentScore - opponentScore >= BADMINTON_WIN_BY
  );
}

// Normalize legacy metadata formats into { team_a_pos, team_b_pos }
function normalizeBadmintonPositionsFromMeta(meta: any): {
  team_a_pos: TeamPositions;
  team_b_pos: TeamPositions;
} {
  if (meta.team_a_pos) {
    return {
      team_a_pos: { ...meta.team_a_pos },
      team_b_pos: { ...meta.team_b_pos },
    };
  }
  if (meta.positions?.a) {
    return {
      team_a_pos: {
        right_player_id: meta.positions.a.right,
        left_player_id: meta.positions.a.left,
      },
      team_b_pos: {
        right_player_id: meta.positions.b.right,
        left_player_id: meta.positions.b.left,
      },
    };
  }
  if (meta.positions?.pos_1 !== undefined) {
    return {
      team_a_pos: {
        right_player_id: meta.positions.pos_1,
        left_player_id: meta.positions.pos_2,
      },
      team_b_pos: {
        right_player_id: meta.positions.pos_3,
        left_player_id: meta.positions.pos_4,
      },
    };
  }
  if (meta.pos_1 !== undefined) {
    return {
      team_a_pos: {
        right_player_id: meta.pos_1,
        left_player_id: meta.pos_2,
      },
      team_b_pos: {
        right_player_id: meta.pos_3,
        left_player_id: meta.pos_4,
      },
    };
  }
  throw new Error("Invalid metadata structure: missing positions");
}

function getTeamAOnLeftAndStoredPositions(
  meta: any,
  team_a_pos: TeamPositions,
  team_b_pos: TeamPositions,
): { teamAOnLeft: boolean; updatedPositions: StoredPositions } {
  const teamAIds = [team_a_pos.right_player_id, team_a_pos.left_player_id];
  let teamAOnLeft: boolean;
  if (meta.team_a_on_left_court === false) teamAOnLeft = false;
  else if (meta.team_a_on_left_court === true) teamAOnLeft = true;
  else if (hasStoredPositions(meta))
    teamAOnLeft =
      teamAIds.includes(meta.positions.pos_1) ||
      teamAIds.includes(meta.positions.pos_2);
  else teamAOnLeft = true;

  // Output (left, right) per court to match start-match convention and avoid wrong-side swap:
  // pos_1/pos_2 = left court (odd, even); pos_3/pos_4 = right court (odd, even).
  const updatedPositions: StoredPositions = teamAOnLeft
    ? {
        pos_1: team_a_pos.left_player_id,
        pos_2: team_a_pos.right_player_id,
        pos_3: team_b_pos.left_player_id,
        pos_4: team_b_pos.right_player_id,
      }
    : {
        pos_1: team_b_pos.left_player_id,
        pos_2: team_b_pos.right_player_id,
        pos_3: team_a_pos.left_player_id,
        pos_4: team_a_pos.right_player_id,
      };
  return { teamAOnLeft, updatedPositions };
}

/** Marks match complete and applies final player rating update (only on match completion). */
async function completeMatchInDb(
  match_id: number,
  winnerId: number,
  teamA_ids: number[],
  teamB_ids: number[],
  scoreA: number,
  scoreB: number,
): Promise<void> {
  await supabase
    .from("matches")
    .update({
      status: "completed",
      winner_team_id: winnerId,
      end_time: new Date().toISOString(),
    })
    .eq("id", match_id);
  await update_player_ratings_in_db(
    match_id,
    teamA_ids,
    teamB_ids,
    scoreA,
    scoreB,
  );
}

// Helper: Verify teams and return IDs strictly (A = Lower ID, B = Higher ID)
export async function getMatchContext(matchId: number) {
  // 1. Get Match Status & Pairing & Tournament
  const { data: match, error: mErr } = await supabase
    .from("matches")
    .select("id, status, round, tournament_id")
    .eq("id", matchId)
    .single();

  if (mErr || !match) throw new Error("Match not found or invalid ID");

  // 2. Fetch Game ID from Tournament
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("game_id")
    .eq("id", match.tournament_id)
    .single();
  // Default to 1 (Pickleball) if not found, or maybe generic
  const gameId = tournament?.game_id || 1;

  // 3. Get Pairing
  const { data: pairing, error: pErr } = await supabase
    .from("pairings")
    .select("id")
    .eq("match_id", matchId)
    .single();

  if (pErr || !pairing)
    throw new Error("Pairing configuration missing for this match");

  // 4. Get Teams
  const { data: teams, error: tErr } = await supabase
    .from("pairing_teams")
    .select("team_id")
    .eq("pairing_id", pairing.id)
    .order("team_id", { ascending: true }); // STRICT ORDERING

  if (tErr || !teams || teams.length !== 2)
    throw new Error("Invalid team configuration in DB");

  return {
    matchStatus: match.status,
    teamA_id: teams[0].team_id,
    teamB_id: teams[1].team_id,
    gameId: gameId,
    tournamentId: match.tournament_id,
    round: match.round,
  };
}

// ============================================================================
// 1. START MATCH
// ============================================================================
app.post("/start", async (c) => {
  try {
    const body = (await c.req.json()) as StartMatchPayload;
    const { match_id, serving_team_id, serving_player_id, positions } = body;

    console.log("Player Positions:", positions);

    // 1. Validate Input Existence (Common)
    if (!match_id || !positions) {
      return c.json(
        { error: "Missing required fields (match_id, positions)" },
        400,
      );
    }

    // 2. Validate Match Context
    const ctx = await getMatchContext(match_id);

    // 3. Validate Match Status
    if (ctx.matchStatus === "completed") {
      return c.json({ error: "Match is already completed." }, 400);
    }
    if (ctx.matchStatus === "in_progress") {
      // Optional: allow restart? Existing code said no.
      // return c.json({ error: "Match is already in progress. Cannot restart." }, 400);
    }

    // 4. Validate and Detect Team Sides
    const teamAMembers = await supabase
      .from("team_members")
      .select("player_id")
      .eq("team_id", ctx.teamA_id);
    console.log("Team A Members:", teamAMembers.data);

    const teamBMembers = await supabase
      .from("team_members")
      .select("player_id")
      .eq("team_id", ctx.teamB_id);
    console.log("Team B Members:", teamBMembers.data);

    if (!teamAMembers.data || !teamBMembers.data)
      return c.json({ error: "Failed to fetch team members" }, 500);

    const aIds = teamAMembers.data.map((m) => m.player_id);
    const bIds = teamBMembers.data.map((m) => m.player_id);

    const leftIds = [positions.pos_1, positions.pos_2];
    const rightIds = [positions.pos_3, positions.pos_4];

    let teamA_PosArr: number[];
    let teamB_PosArr: number[];

    // Check if Left Side (Pos 1/2) corresponds to Team A
    if (leftIds.every((id) => aIds.includes(id))) {
      teamA_PosArr = leftIds;
      // Expect Right Side to be Team B
      if (!rightIds.every((id) => bIds.includes(id)))
        return c.json({ error: "Invalid Team B players on Right side" }, 400);
      teamB_PosArr = rightIds;
    } else if (leftIds.every((id) => bIds.includes(id))) {
      // Left Side is Team B
      teamB_PosArr = leftIds;
      // Expect Right Side to be Team A
      if (!rightIds.every((id) => aIds.includes(id)))
        return c.json({ error: "Invalid Team A players on Right side" }, 400);
      teamA_PosArr = rightIds;
    } else {
      return c.json(
        {
          error:
            "Left side players do not form a valid complete Team (within A or B)",
        },
        400,
      );
    }

    // 5. Clean Slate
    const { error: delError } = await supabase
      .from("scores")
      .delete()
      .eq("match_id", match_id);
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
      if (!serving_team_id)
        return c.json({ error: "Pickleball requires serving_team_id" }, 400);
      finalServingTeamId = serving_team_id;

      const metadata: PickleballMetadata = {
        team_a_pos: {
          right_player_id: teamA_PosArr[0],
          left_player_id: teamA_PosArr[1],
        },
        team_b_pos: {
          right_player_id: teamB_PosArr[0],
          left_player_id: teamB_PosArr[1],
        },
        positions: {
          pos_1: positions.pos_1,
          pos_2: positions.pos_2,
          pos_3: positions.pos_3,
          pos_4: positions.pos_4,
        },
      };

      const { data, error } = await supabase
        .from("scores")
        .insert({
          match_id,
          team_a_score: 0,
          team_b_score: 0,
          serving_team_id,
          server_sequence: 2,
          metadata: metadata,
        })
        .select()
        .single();
      if (error) throw error;
      initialState = data;

      // ---------------------------------------------------------
      // LOGIC BRANCH: BADMINTON (Game ID = 2)
      // ---------------------------------------------------------
    } else if (ctx.gameId === 2) {
      if (!serving_player_id)
        return c.json({ error: "Badminton requires serving_player_id" }, 400);

      // Determine Serving Team
      if (aIds.includes(serving_player_id)) finalServingTeamId = ctx.teamA_id;
      else if (bIds.includes(serving_player_id))
        finalServingTeamId = ctx.teamB_id;
      else
        return c.json(
          { error: "Serving player not found in either team" },
          400,
        );

      // BWF: even points → serve from right service court; odd → left service court.
      // Client pos_1 = first slot (e.g. viewer's left) = left/odd court; pos_2 = right/even court.
      const ta: TeamPositions = {
        right_player_id: teamA_PosArr[1],
        left_player_id: teamA_PosArr[0],
      };
      const tb: TeamPositions = {
        right_player_id: teamB_PosArr[1],
        left_player_id: teamB_PosArr[0],
      };

      // pos_1/pos_2 = left court in client; Team A on left iff leftIds were Team A
      const team_a_on_left_court = teamA_PosArr === leftIds;

      const metadata: BadmintonMetadata = {
        sets: { a: 0, b: 0 },
        serving_player_id: serving_player_id,
        team_a_pos: ta,
        team_b_pos: tb,
        team_a_on_left_court,
        positions: {
          pos_1: positions.pos_1,
          pos_2: positions.pos_2,
          pos_3: positions.pos_3,
          pos_4: positions.pos_4,
        },
      };

      const { data, error } = await supabase
        .from("scores")
        .insert({
          match_id,
          team_a_score: 0,
          team_b_score: 0,
          serving_team_id: finalServingTeamId,
          server_sequence: null,
          metadata: metadata,
        })
        .select()
        .single();

      if (error) throw error;
      initialState = data;
    } else {
      return c.json({ error: "Unknown Game ID" }, 400);
    }

    // Update Match Status
    await supabase
      .from("matches")
      .update({ status: "in_progress", start_time: new Date().toISOString() })
      .eq("id", match_id);

    // Broadcast Tournament Update (Match Started)
    broadcastTournamentUpdate(ctx.tournamentId, "match_start", {
      matchId: Number(match_id),
      status: "in_progress",
      round: ctx.round,
    });

    // Broadcast Initial Score
    broadcastMatchScore(Number(match_id), 0, 0, 50);

    // Normalize Response — return the same positions that were validated from the payload
    const response: any = {
      success: true,
      message: "Match Started",
      score_1_2: 0,
      score_3_4: 0,
      state: initialState,
      game_id: ctx.gameId,
      positions: {
        pos_1: positions.pos_1,
        pos_2: positions.pos_2,
        pos_3: positions.pos_3,
        pos_4: positions.pos_4,
      },
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
app.post("/point", async (c) => {
  try {
    const { match_id, rally_winner_team_id } = await c.req.json();

    if (!match_id || !rally_winner_team_id) {
      return c.json({ error: "Missing match_id or rally_winner_team_id" }, 400);
    }

    const ctx = await getMatchContext(match_id);

    if (ctx.matchStatus === "completed") {
      return c.json({ error: "Match is finished. Cannot add points." }, 400);
    }

    if (
      rally_winner_team_id !== ctx.teamA_id &&
      rally_winner_team_id !== ctx.teamB_id
    ) {
      return c.json(
        {
          error: `Rally Winner Team ID ${rally_winner_team_id} does not belong to this match.`,
        },
        400,
      );
    }

    const { data: current, error } = await supabase
      .from("scores")
      .select("*")
      .eq("match_id", match_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !current)
      throw new Error("Match not started (No score history found)");

    // ---------------------------------------------------------
    // PICKLEBALL LOGIC
    // ---------------------------------------------------------
    if (ctx.gameId === 1) {
      let scoreA = current.team_a_score;
      let scoreB = current.team_b_score;
      let servingTeam = current.serving_team_id;
      let sequence = current.server_sequence;
      let metadata = current.metadata as PickleballMetadata;
      const isServerWinner = servingTeam === rally_winner_team_id;

      if (isServerWinner) {
        if (servingTeam === ctx.teamA_id) {
          scoreA++;
          swapPositions(metadata.team_a_pos);
        } else {
          scoreB++;
          swapPositions(metadata.team_b_pos);
        }
      } else {
        // Side Out
        if (sequence === 1) {
          sequence = 2; // Second server
        } else {
          sequence = 1; // Hand over
          servingTeam =
            servingTeam === ctx.teamA_id ? ctx.teamB_id : ctx.teamA_id;
        }
        // No score change, No position swap
      }

      const { error: insertErr } = await supabase.from("scores").insert({
        match_id,
        team_a_score: scoreA,
        team_b_score: scoreB,
        serving_team_id: servingTeam,
        server_sequence: sequence,
        metadata: metadata,
      });

      if (insertErr) throw insertErr;

      // Check Win (Single Set Match)
      let matchComplete = false;
      let winnerId = null;
      if (scoreA >= PB_POINTS_TO_WIN && scoreA - scoreB >= PB_WIN_BY) {
        matchComplete = true;
        winnerId = ctx.teamA_id;
      } else if (scoreB >= PB_POINTS_TO_WIN && scoreB - scoreA >= PB_WIN_BY) {
        matchComplete = true;
        winnerId = ctx.teamB_id;
      }

      if (matchComplete && winnerId !== null) {
        await completeMatchInDb(
          Number(match_id),
          winnerId,
          [
            Number(metadata.team_a_pos.left_player_id),
            Number(metadata.team_a_pos.right_player_id),
          ],
          [
            Number(metadata.team_b_pos.left_player_id),
            Number(metadata.team_b_pos.right_player_id),
          ],
          scoreA,
          scoreB,
        );
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
            pos_4: metadata.team_b_pos.right_player_id,
          },
        },
      });
    } else if (ctx.gameId === 2) {
      const meta = current.metadata as any;
      let scoreA = current.team_a_score;
      let scoreB = current.team_b_score;
      let servingTeam = current.serving_team_id;
      let sets = { ...meta.sets };

      const { team_a_pos, team_b_pos } =
        normalizeBadmintonPositionsFromMeta(meta);
      let servingPlayer = meta.serving_player_id;
      console.log("Serving Player:", servingPlayer);

      const isTeamAWinRally = rally_winner_team_id === ctx.teamA_id;
      const isServerWinRally = servingTeam === rally_winner_team_id;

      if (isTeamAWinRally) scoreA++;
      else scoreB++;

      if (isServerWinRally) {
        if (isTeamAWinRally) swapPositions(team_a_pos);
        else swapPositions(team_b_pos);
      } else {
        servingTeam = rally_winner_team_id;
        servingPlayer = isTeamAWinRally
          ? scoreA % 2 === 0
            ? team_a_pos.right_player_id
            : team_a_pos.left_player_id
          : scoreB % 2 === 0
          ? team_b_pos.right_player_id
          : team_b_pos.left_player_id;
      }

      let matchComplete = false;
      let winnerId: number | null = null;
      if (checkBadmintonSetWin(scoreA, scoreB)) {
        sets.a++;
        matchComplete = true;
        winnerId = ctx.teamA_id;
      } else if (checkBadmintonSetWin(scoreB, scoreA)) {
        sets.b++;
        matchComplete = true;
        winnerId = ctx.teamB_id;
      }

      const { teamAOnLeft, updatedPositions } =
        getTeamAOnLeftAndStoredPositions(meta, team_a_pos, team_b_pos);

      const newMeta: BadmintonMetadata = {
        sets,
        serving_player_id: servingPlayer,
        team_a_pos,
        team_b_pos,
        team_a_on_left_court: meta.team_a_on_left_court ?? teamAOnLeft,
        ...(hasStoredPositions(meta) && { positions: updatedPositions }),
      };

      const { error: insertErr } = await supabase
        .from("scores")
        .insert({
          match_id,
          team_a_score: scoreA,
          team_b_score: scoreB,
          serving_team_id: servingTeam,
          server_sequence: null,
          metadata: newMeta,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      if (matchComplete && winnerId !== null) {
        const teamA_ids = [
          Number(team_a_pos.right_player_id),
          Number(team_a_pos.left_player_id),
        ];
        const teamB_ids = [
          Number(team_b_pos.right_player_id),
          Number(team_b_pos.left_player_id),
        ];
        await completeMatchInDb(
          match_id,
          winnerId,
          teamA_ids,
          teamB_ids,
          scoreA,
          scoreB,
        );
        broadcastTournamentUpdate(ctx.tournamentId, "match_complete", {
          matchId: Number(match_id),
          status: "completed",
          winnerTeamId: winnerId,
          round: ctx.round,
        });
      }

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
          positions: updatedPositions,
        },
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
app.post("/undo", async (c) => {
  try {
    const { match_id } = await c.req.json();
    if (!match_id) return c.json({ error: "Missing match_id" }, 400);

    // 1. Check Record Count
    const { count } = await supabase
      .from("scores")
      .select("*", { count: "exact", head: true })
      .eq("match_id", match_id);

    if (count !== null && count <= 1) {
      console.log("Cannot undo. Match is at start state.");
      return c.json({ error: "Cannot undo. Match is at start state." }, 400);
    }

    // 2. Get Latest ID to Delete
    const { data: latest } = await supabase
      .from("scores")
      .select("id")
      .eq("match_id", match_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!latest) {
      console.log("No score found to undo");
      return c.json({ error: "No score found to undo" }, 404);
    }

    // Final rating update runs only on match completion. If we're undoing a
    // completed match, restore player ratings to their beginning-of-match state.
    const { data: matchBeforeUndo } = await supabase
      .from("matches")
      .select("status")
      .eq("id", match_id)
      .single();
    const needRevertRatings = matchBeforeUndo?.status === "completed";

    // 3. Delete Latest
    await supabase.from("scores").delete().eq("id", latest.id);

    if (needRevertRatings) {
      await revert_player_ratings_for_match(Number(match_id));
    }

    // 4. Fetch NEW Current State (the state before the deleted one)
    const { data: current } = await supabase
      .from("scores")
      .select("*")
      .eq("match_id", match_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!current) {
      // This should ideally not happen if count > 1, but as a safeguard
      console.log("No previous state found after undo");
      return c.json({ error: "No previous state found after undo" }, 500);
    }

    const scoreA = current.team_a_score;
    const scoreB = current.team_b_score;

    // Get Game ID from Match/tournament
    const { data: match } = await supabase
      .from("matches")
      .select("tournament_id")
      .eq("id", Number(match_id))
      .single();
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("game_id")
      .eq("id", Number(match?.tournament_id))
      .single();

    const GameId = Number(tournament?.game_id);

    const getMatchState = (
      gameId: number,
    ):
      | {
          metadata: PickleballMetadata | BadmintonMetadata;
          isWinA: boolean;
          isWinB: boolean;
          pointsToWin: number;
          winBy: number;
        }
      | undefined => {
      if (gameId === 1) {
        const metadata = current.metadata as PickleballMetadata;
        const isWinA =
          scoreA >= PICKLEBALL_METADATA.POINTS_TO_WIN &&
          scoreA - scoreB >= PICKLEBALL_METADATA.WIN_BY;
        const isWinB =
          scoreB >= PICKLEBALL_METADATA.POINTS_TO_WIN &&
          scoreB - scoreA >= PICKLEBALL_METADATA.WIN_BY;
        return {
          metadata,
          isWinA,
          isWinB,
          pointsToWin: PICKLEBALL_METADATA.POINTS_TO_WIN,
          winBy: PICKLEBALL_METADATA.WIN_BY,
        };
      } else if (gameId === 2) {
        const metadata = current.metadata as BadmintonMetadata;
        const isWinA =
          scoreA >= BADMINTON_METADATA.POINTS_TO_WIN &&
          scoreA - scoreB >= BADMINTON_METADATA.WIN_BY;
        const isWinB =
          scoreB >= BADMINTON_METADATA.POINTS_TO_WIN &&
          scoreB - scoreA >= BADMINTON_METADATA.WIN_BY;
        return {
          metadata,
          isWinA,
          isWinB,
          pointsToWin: BADMINTON_METADATA.POINTS_TO_WIN,
          winBy: BADMINTON_METADATA.WIN_BY,
        };
      }
      return undefined;
    };

    const matchState = getMatchState(GameId);

    if (!matchState) {
      console.log("No match state found");
      return c.json({ error: "No match state found" }, 404);
    }

    const { metadata, isWinA, isWinB } = matchState;

    // 5. REVERT MATCH STATUS LOGIC
    // If match was completed, we need to check if it's STILL completed (usually not after undo)
    // Simple logic: Force in_progress if we undo.
    if (!isWinA && !isWinB) {
      await supabase
        .from("matches")
        .update({
          status: "in_progress",
          winner_team_id: null,
          end_time: null,
        })
        .eq("id", match_id);
    }

    const ctx = await getMatchContext(Number(match_id));

    const tA_ids = [
      Number(metadata.team_a_pos.right_player_id),
      Number(metadata.team_a_pos.left_player_id),
    ];
    const tB_ids = [
      Number(metadata.team_b_pos.right_player_id),
      Number(metadata.team_b_pos.left_player_id),
    ];

    // Broadcast Status Revert
    console.log("Broadcasting status revert");
    broadcastTournamentUpdate(ctx.tournamentId, "match_update", {
      matchId: Number(match_id),
      status: "in_progress",
      winnerTeamId: null,
      round: ctx.round,
    });

    // Broadcast undo update
    const winRate = calculateWinRate(scoreA, scoreB);
    broadcastMatchScore(Number(match_id), scoreA, scoreB, winRate);

    const response: any = {
      success: true,
      score_1_2: scoreA, // Integer score for Team A
      score_3_4: scoreB, // Integer score for Team B
    };

    // GAME ID 1: PICKLEBALL LOGIC
    // GAME ID 2: BADMINTON LOGIC
    if (ctx.gameId === 1) {
      const meta = current.metadata as PickleballMetadata;
      response.server_seq = current.server_sequence;
      response.positions = hasStoredPositions(meta)
        ? { ...meta.positions }
        : {
            pos_1: meta.team_a_pos.left_player_id,
            pos_2: meta.team_a_pos.right_player_id,
            pos_3: meta.team_b_pos.left_player_id,
            pos_4: meta.team_b_pos.right_player_id,
          };
    } else {
      const meta = current.metadata as any;
      response.sets = meta.sets;
      response.serving_player_id = meta.serving_player_id;

      let team_a_pos: TeamPositions;
      let team_b_pos: TeamPositions;

      if (meta.team_a_pos) {
        team_a_pos = meta.team_a_pos;
        team_b_pos = meta.team_b_pos;
      } else if (meta.positions && meta.positions.a) {
        team_a_pos = {
          right_player_id: meta.positions.a.right,
          left_player_id: meta.positions.a.left,
        };
        team_b_pos = {
          right_player_id: meta.positions.b.right,
          left_player_id: meta.positions.b.left,
        };
      } else if (meta.positions && meta.positions.pos_1 !== undefined) {
        team_a_pos = {
          right_player_id: meta.positions.pos_2,
          left_player_id: meta.positions.pos_1,
        };
        team_b_pos = {
          right_player_id: meta.positions.pos_4,
          left_player_id: meta.positions.pos_3,
        };
      } else {
        if (meta.pos_1 !== undefined) {
          team_a_pos = {
            right_player_id: meta.pos_2,
            left_player_id: meta.pos_1,
          };
          team_b_pos = {
            right_player_id: meta.pos_4,
            left_player_id: meta.pos_3,
          };
        } else {
          team_a_pos = { right_player_id: 0, left_player_id: 0 };
          team_b_pos = { right_player_id: 0, left_player_id: 0 };
        }
      }

      response.positions = hasStoredPositions(meta)
        ? { ...meta.positions }
        : {
            pos_1: team_a_pos.left_player_id,
            pos_2: team_a_pos.right_player_id,
            pos_3: team_b_pos.left_player_id,
            pos_4: team_b_pos.right_player_id,
          };
    }

    // Ratings are updated only on match completion. On undo we either reverted
    // them to beginning-of-match (if match was completed) or they were never applied.
    return c.json({ data: response });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ============================================================================
// 4. GET MATCH STATE
// ============================================================================
app.get("/:id", async (c) => {
  const match_id = c.req.param("id");
  try {
    const { data: current } = await supabase
      .from("scores")
      .select("*")
      .eq("match_id", match_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!current) return c.json({ error: "No match data found" }, 404);

    const ctx = await getMatchContext(Number(match_id));

    const response: any = {
      ...current,
      score_1_2: current.team_a_score,
      score_3_4: current.team_b_score,
      gameId: ctx.gameId,
    };

    if (ctx.gameId === 2) {
      const meta = current.metadata as any;
      //   console.log("DEBUG MATCH ID:", match_id);
      //   console.log("DEBUG METADATA RAW:", JSON.stringify(meta, null, 2));

      let team_a_pos: TeamPositions;
      let team_b_pos: TeamPositions;

      if (meta.team_a_pos) {
        console.log("Detected NEW format");
        team_a_pos = meta.team_a_pos;
        team_b_pos = meta.team_b_pos;
      } else if (meta.positions && meta.positions.a) {
        console.log("Detected LEGACY format A (Nested)");
        team_a_pos = {
          right_player_id: meta.positions.a.right,
          left_player_id: meta.positions.a.left,
        };
        team_b_pos = {
          right_player_id: meta.positions.b.right,
          left_player_id: meta.positions.b.left,
        };
      } else if (meta.positions && meta.positions.pos_1 !== undefined) {
        console.log("Detected LEGACY format B (Flat)");
        team_a_pos = {
          right_player_id: meta.positions.pos_1,
          left_player_id: meta.positions.pos_2,
        };
        team_b_pos = {
          right_player_id: meta.positions.pos_3,
          left_player_id: meta.positions.pos_4,
        };
      } else {
        console.log("Detected UNKNOWN format - Fallback to zeros");
        // Last ditch effort: maybe they are on root level?
        if (meta.pos_1 !== undefined) {
          console.log("Detected ROOT format");
          team_a_pos = {
            right_player_id: meta.pos_1,
            left_player_id: meta.pos_2,
          };
          team_b_pos = {
            right_player_id: meta.pos_3,
            left_player_id: meta.pos_4,
          };
        } else {
          team_a_pos = { right_player_id: 0, left_player_id: 0 };
          team_b_pos = { right_player_id: 0, left_player_id: 0 };
        }
      }

      // Preserve initial court sides: pos_1/2 = left court, pos_3/4 = right court; infer when undefined
      const teamAIdsGetState = [
        team_a_pos.right_player_id,
        team_a_pos.left_player_id,
      ];
      let teamAOnLeftGetState: boolean;
      if (meta.team_a_on_left_court === false) {
        teamAOnLeftGetState = false;
      } else if (meta.team_a_on_left_court === true) {
        teamAOnLeftGetState = true;
      } else if (hasStoredPositions(meta)) {
        teamAOnLeftGetState =
          teamAIdsGetState.includes(meta.positions!.pos_1) ||
          teamAIdsGetState.includes(meta.positions!.pos_2);
      } else {
        teamAOnLeftGetState = true;
      }
      response.display_positions = hasStoredPositions(meta)
        ? { ...meta.positions }
        : teamAOnLeftGetState
        ? {
            pos_1: team_a_pos.left_player_id,
            pos_2: team_a_pos.right_player_id,
            pos_3: team_b_pos.left_player_id,
            pos_4: team_b_pos.right_player_id,
          }
        : {
            pos_1: team_b_pos.left_player_id,
            pos_2: team_b_pos.right_player_id,
            pos_3: team_a_pos.left_player_id,
            pos_4: team_a_pos.right_player_id,
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
        team_b_pos,
      };
    } else {
      const meta = current.metadata as PickleballMetadata;
      response.display_positions = hasStoredPositions(meta)
        ? { ...meta.positions }
        : {
            pos_1: meta.team_a_pos.left_player_id,
            pos_2: meta.team_a_pos.right_player_id,
            pos_3: meta.team_b_pos.left_player_id,
            pos_4: meta.team_b_pos.right_player_id,
          };
    }

    console.log("Match State:", JSON.stringify(response, null, 2));

    return c.json({ data: response });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export default app;
