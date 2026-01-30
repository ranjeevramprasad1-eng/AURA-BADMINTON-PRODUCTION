import { HTTPException } from "hono/http-exception";
import { supabase } from "@/lib/supabase";
import type { Context } from "hono";
import type { AuthContext } from "@/middleware/auth";
import type { z } from "zod";
import type {
  matchIdSchema,
  createMatchSchema,
  updateMatchSchema,
  tournamentIdSchema,
  startMatchSchema,
  recordPointSchema,
} from "@/utils/validation";
// Import types and constants from scoring.ts
import { POINTS_TO_WIN, WIN_BY, type PickleballMetadata } from "@/lib/scoring";
import {
  update_player_ratings_in_db,
  blended_point_prob,
  match_prob_with_beta_uncertainty,
} from "@/lib/rating_calculations";
import {
  broadcastMatchScore,
  broadcastMatchEnd,
  broadcastTournamentUpdate,
} from "@/lib/websocket";

// Helper: Verify teams and return IDs strictly (A = Lower ID, B = Higher ID)
async function getMatchContext(matchId: number) {
  const { data: match, error: mErr } = await supabase
    .from("matches")
    .select("id, status, round")
    .eq("id", matchId)
    .single();

  if (mErr || !match) {
    throw new HTTPException(404, { message: "Match not found or invalid ID" });
  }

  const { data: pairing, error: pErr } = await supabase
    .from("pairings")
    .select("id")
    .eq("match_id", matchId)
    .single();

  if (pErr || !pairing) {
    throw new HTTPException(400, {
      message: "Pairing configuration missing for this match",
    });
  }

  const { data: teams, error: tErr } = await supabase
    .from("pairing_teams")
    .select("team_id")
    .eq("pairing_id", pairing.id)
    .order("team_id", { ascending: true });

  if (tErr || !teams || teams.length !== 2) {
    throw new HTTPException(400, {
      message: "Invalid team configuration in DB",
    });
  }

  // Get positions from last score data (if match has started)
  let positions: PickleballMetadata | null = null;
  const { data: lastScore, error: scoreErr } = await supabase
    .from("scores")
    .select("metadata")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!scoreErr && lastScore && lastScore.metadata) {
    positions = lastScore.metadata as PickleballMetadata;
  }

  return {
    matchStatus: match.status,
    teamA_id: teams[0].team_id,
    teamB_id: teams[1].team_id,
    positions: positions,
  };
}

// Helper: Check if specific players belong to a team
async function validatePlayersInTeam(
  teamId: number,
  playerIds: number[],
): Promise<boolean> {
  const { data: members, error } = await supabase
    .from("team_members")
    .select("player_id")
    .eq("team_id", teamId);

  if (error || !members) return false;

  const dbMemberIds = members.map((m: any) => m.player_id);
  return playerIds.every((id) => dbMemberIds.includes(id));
}

// GET /matches - Get all matches (with optional filters)
export async function getAllMatches(c: Context<AuthContext>) {
  try {
    const tournamentId = c.req.query("tournament_id");
    const round = c.req.query("round");
    const status = c.req.query("status");

    let query = supabase
      .from("matches")
      .select(
        `
        id,
        tournament_id,
        refree_id,
        court_id,
        winner_team_id,
        round,
        status,
        start_time,
        end_time,
        tournaments (
          id,
          name
        ),
        courts (
          id,
          court_number
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (tournamentId) {
      query = query.eq("tournament_id", parseInt(tournamentId));
    }
    if (round) {
      query = query.eq("round", round);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data: matches, error } = await query;

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    return c.json({ data: { matches } });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// GET /matches/:id - Get match by ID
export async function getMatchById(c: Context<AuthContext>) {
  try {
    const params = (c.req as any).valid("param") as any as z.infer<
      typeof matchIdSchema
    >;
    const matchId = parseInt(params.id);

    if (isNaN(matchId)) {
      throw new HTTPException(400, { message: "Invalid match ID" });
    }

    const { data: match, error } = await supabase
      .from("matches")
      .select(
        `
        id,
        tournament_id,
        refree_id,
        court_id,
        winner_team_id,
        round,
        status,
        start_time,
        end_time,
        tournaments (
          id,
          name
        ),
        courts (
          id,
          court_number
        )
      `,
      )
      .eq("id", matchId)
      .single();

    if (error || !match) {
      throw new HTTPException(404, { message: "Match not found" });
    }

    // Get pairings for this match
    const { data: _pairings } = await supabase
      .from("pairings")
      .select(
        `
        id,
        pairing_teams (
          team_id,
          teams (
            team_id,
            team_members (
              player_id,
              players (
                id,
                username,
                photo_url
              )
            )
          )
        )
      `,
      )
      .eq("match_id", matchId)
      .single();

    // Transform pairings to the desired format: [{ id: team_id, members: [...] }]
    const teams =
      _pairings?.pairing_teams?.map((pt: any) => {
        const team = Array.isArray(pt.teams) ? pt.teams[0] : pt.teams;
        const teamMembers = team?.team_members || [];

        return {
          id: pt.team_id,
          members: teamMembers.map((tm: any) => {
            const player = Array.isArray(tm.players)
              ? tm.players[0]
              : tm.players;
            return {
              id: player?.id,
              username: player?.username,
              photo_url: player?.photo_url,
            };
          }),
        };
      }) || [];

    // Get scores
    const { data: scores } = await supabase
      .from("scores")
      .select("*")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });

    const result = {
      ...match,
      teams: teams,
      scores: scores || [],
    };

    return c.json({
      data: result,
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// GET /tournaments/:id/matches - Get all matches for a tournament
export async function getTournamentMatches(c: Context<AuthContext>) {
  try {
    const params = (c.req as any).valid("param") as any as z.infer<
      typeof tournamentIdSchema
    >;
    const tournamentId = parseInt(params.id);

    if (isNaN(tournamentId)) {
      throw new HTTPException(400, { message: "Invalid tournament ID" });
    }

    const { data: matches, error } = await supabase
      .from("matches")
      .select(
        `
        id,
        refree_id,
        court_id,
        winner_team_id,
        round,
        status,
        start_time,
        end_time,
        courts (
          id,
          court_number
        )
      `,
      )
      .eq("tournament_id", tournamentId)
      .order("round", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    return c.json({ data: { matches } });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// POST /matches - Create a new match
export async function createMatch(c: Context<AuthContext>) {
  try {
    const body = (c.req as any).valid("json") as any as z.infer<
      typeof createMatchSchema
    >;

    // Verify tournament exists
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("id")
      .eq("id", body.tournament_id)
      .single();

    if (!tournament) {
      throw new HTTPException(404, { message: "Tournament not found" });
    }

    // Verify court exists if provided
    if (body.court_id) {
      const { data: court } = await supabase
        .from("courts")
        .select("id")
        .eq("id", body.court_id)
        .single();

      if (!court) {
        throw new HTTPException(404, { message: "Court not found" });
      }
    }

    // Verify referee exists if provided
    if (body.referee_id) {
      const { data: referee } = await supabase
        .from("players")
        .select("id")
        .eq("id", body.referee_id)
        .single();

      if (!referee) {
        throw new HTTPException(404, { message: "Referee not found" });
      }
    }

    const { data: match, error } = await supabase
      .from("matches")
      .insert({
        tournament_id: body.tournament_id,
        refree_id: body.referee_id || null,
        court_id: body.court_id || 1 || null,
        round: body.round,
        status: body.status || "scheduled",
        start_time: body.start_time || null,
        end_time: body.end_time || null,
      })
      .select()
      .single();

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    return c.json({ data: match }, 201);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// PUT /matches/:id - Update match
export async function updateMatch(c: Context<AuthContext>) {
  try {
    const playerId = c.get("playerId");
    const params = (c.req as any).valid("param") as any as z.infer<
      typeof matchIdSchema
    >;
    const matchId = parseInt(params.id);
    const body = (c.req as any).valid("json") as any as z.infer<
      typeof updateMatchSchema
    >;

    if (isNaN(matchId)) {
      throw new HTTPException(400, { message: "Invalid match ID" });
    }

    // Verify match exists
    const { data: existingMatch } = await supabase
      .from("matches")
      .select("tournament_id")
      .eq("id", matchId)
      .single();

    if (!existingMatch) {
      throw new HTTPException(404, { message: "Match not found" });
    }

    // Get tournament info
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("host_id")
      .eq("id", existingMatch.tournament_id)
      .single();

    // If updating referee_id, verify user is the tournament host
    if (body.referee_id !== undefined) {
      if (!tournament) {
        throw new HTTPException(404, { message: "Tournament not found" });
      }

      if (tournament.host_id !== playerId) {
        throw new HTTPException(403, {
          message: "Only the tournament host can assign referees",
        });
      }

      // Verify referee is in the tournament referee pool
      const { data: refereeCheck } = await supabase
        .from("tournaments_referee")
        .select("id")
        .eq("tournament_id", existingMatch.tournament_id)
        .eq("player_id", body.referee_id)
        .single();

      if (!refereeCheck) {
        throw new HTTPException(400, {
          message: "Referee must be in the tournament referee pool",
        });
      }
    }

    // Verify court exists if provided
    if (body.court_id) {
      const { data: court } = await supabase
        .from("courts")
        .select("id")
        .eq("id", body.court_id)
        .single();

      if (!court) {
        throw new HTTPException(404, { message: "Court not found" });
      }
    }

    // Verify referee exists if provided
    if (body.referee_id) {
      const { data: referee } = await supabase
        .from("players")
        .select("id")
        .eq("id", body.referee_id)
        .single();

      if (!referee) {
        throw new HTTPException(404, { message: "Referee not found" });
      }
    }

    // Verify winner team exists if provided
    if (body.winner_team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("team_id")
        .eq("team_id", body.winner_team_id)
        .single();

      if (!team) {
        throw new HTTPException(404, { message: "Winner team not found" });
      }
    }

    const updateData: any = {};
    if (body.referee_id !== undefined) updateData.refree_id = body.referee_id;
    if (body.court_id !== undefined) updateData.court_id = body.court_id;
    if (body.winner_team_id !== undefined)
      updateData.winner_team_id = body.winner_team_id;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.start_time !== undefined) updateData.start_time = body.start_time;
    if (body.end_time !== undefined) updateData.end_time = body.end_time;

    const { data: match, error } = await supabase
      .from("matches")
      .update(updateData)
      .eq("id", matchId)
      .select()
      .single();

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    return c.json({ data: match });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// DELETE /matches/:id - Delete match
export async function deleteMatch(c: Context<AuthContext>) {
  try {
    const params = (c.req as any).valid("param") as any as z.infer<
      typeof matchIdSchema
    >;
    const matchId = parseInt(params.id);

    if (isNaN(matchId)) {
      throw new HTTPException(400, { message: "Invalid match ID" });
    }

    // Delete scores first
    await supabase.from("scores").delete().eq("match_id", matchId);

    // Delete pairings
    const { data: pairings } = await supabase
      .from("pairings")
      .select("id")
      .eq("match_id", matchId);

    const pairingIds = pairings?.map((p: any) => p.id) || [];
    if (pairingIds.length > 0) {
      await supabase
        .from("pairing_teams")
        .delete()
        .in("pairing_id", pairingIds);
      await supabase.from("pairings").delete().eq("match_id", matchId);
    }

    // Delete match
    const { error } = await supabase.from("matches").delete().eq("id", matchId);

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    return c.json({ data: { success: true } });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// POST /matches/:id/start - Start a match with positions
export async function startMatch(c: Context<AuthContext>) {
  try {
    const params = (c.req as any).valid("param") as any as z.infer<
      typeof matchIdSchema
    >;
    const body = (c.req as any).valid("json") as any as z.infer<
      typeof startMatchSchema
    >;
    const matchId = parseInt(params.id);

    if (isNaN(matchId)) {
      throw new HTTPException(400, { message: "Invalid match ID" });
    }

    // Get match context (includes validation)
    const ctx = await getMatchContext(matchId);

    // Verify match is not already started or completed
    if (ctx.matchStatus === "in_progress") {
      throw new HTTPException(400, {
        message: "Match is already in progress",
      });
    }
    if (ctx.matchStatus === "completed") {
      throw new HTTPException(400, { message: "Match is already completed" });
    }

    // Validate serving team
    if (
      body.serving_team_id !== ctx.teamA_id &&
      body.serving_team_id !== ctx.teamB_id
    ) {
      throw new HTTPException(400, {
        message: "Serving team must be one of the match teams",
      });
    }

    // Validate players belong to correct teams
    const isTeamAValid = await validatePlayersInTeam(ctx.teamA_id, [
      body.positions.pos_1,
      body.positions.pos_2,
    ]);
    if (!isTeamAValid) {
      throw new HTTPException(400, {
        message: `Players ${body.positions.pos_1} and/or ${body.positions.pos_2} do not belong to Team A (ID: ${ctx.teamA_id})`,
      });
    }

    const isTeamBValid = await validatePlayersInTeam(ctx.teamB_id, [
      body.positions.pos_3,
      body.positions.pos_4,
    ]);
    if (!isTeamBValid) {
      throw new HTTPException(400, {
        message: `Players ${body.positions.pos_3} and/or ${body.positions.pos_4} do not belong to Team B (ID: ${ctx.teamB_id})`,
      });
    }

    // Delete any existing scores for this match (clean slate)
    const { error: deleteError } = await supabase
      .from("scores")
      .delete()
      .eq("match_id", matchId);

    if (deleteError) {
      throw new HTTPException(500, {
        message: `Failed to delete existing scores: ${deleteError.message}`,
      });
    }

    // Verify no scores exist (double-check)
    const { data: existingScores, error: checkError } = await supabase
      .from("scores")
      .select("id")
      .eq("match_id", matchId);

    if (checkError) {
      throw new HTTPException(500, {
        message: `Failed to verify score deletion: ${checkError.message}`,
      });
    }

    if (existingScores && existingScores.length > 0) {
      // Force delete if any remain (shouldn't happen, but safety check)
      await supabase.from("scores").delete().eq("match_id", matchId);
    }

    // Create metadata for positions
    const metadata: PickleballMetadata = {
      team_a_pos: {
        right_player_id: body.positions.pos_1,
        left_player_id: body.positions.pos_2,
      },
      team_b_pos: {
        right_player_id: body.positions.pos_3,
        left_player_id: body.positions.pos_4,
      },
    };

    // Insert initial score record (0-0-2)
    // Start with server_sequence: 2 (second server) so scores can increment immediately
    const initialServerSequence = 2; // Always start with sequence 1
    const { data: score, error: scoreError } = await supabase
      .from("scores")
      .insert({
        match_id: matchId,
        team_a_score: 0,
        team_b_score: 0,
        serving_team_id: body.serving_team_id,
        server_sequence: initialServerSequence,
        metadata: metadata,
      })
      .select()
      .single();

    // Verify the inserted record has the correct sequence
    if (score && score.server_sequence !== initialServerSequence) {
      // If somehow wrong sequence was inserted, delete and throw error
      await supabase.from("scores").delete().eq("id", score.id);
      throw new HTTPException(500, {
        message: `Failed to create initial score with correct sequence. Expected ${initialServerSequence}, got ${score.server_sequence}`,
      });
    }

    if (scoreError) {
      throw new HTTPException(500, { message: scoreError.message });
    }

    // Update match status to in_progress
    const { error: updateError } = await supabase
      .from("matches")
      .update({
        status: "in_progress",
        start_time: new Date().toISOString(),
      })
      .eq("id", matchId);

    if (updateError) {
      throw new HTTPException(500, { message: updateError.message });
    }

    // Broadcast initial score (0-0) when match starts
    broadcastMatchScore(matchId, 0, 0, 50);

    return c.json({
      data: {
        success: true,
        message: "Match started successfully",
        score: {
          teamA: 0,
          teamB: 0,
        },
      },
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// POST /matches/:id/point - Record a point
export async function recordPoint(c: Context<AuthContext>) {
  try {
    const params = (c.req as any).valid("param") as any as z.infer<
      typeof matchIdSchema
    >;
    const body = (c.req as any).valid("json") as any as z.infer<
      typeof recordPointSchema
    >;
    const matchId = parseInt(params.id);

    if (isNaN(matchId)) {
      throw new HTTPException(400, { message: "Invalid match ID" });
    }

    const ctx = await getMatchContext(matchId);

    if (ctx.matchStatus === "completed") {
      throw new HTTPException(400, {
        message: "Match is finished. Cannot add points.",
      });
    }

    if (
      body.rally_winner_team_id !== ctx.teamA_id &&
      body.rally_winner_team_id !== ctx.teamB_id
    ) {
      throw new HTTPException(400, {
        message: `Rally Winner Team ID ${body.rally_winner_team_id} does not belong to this match.`,
      });
    }

    const { data: current, error } = await supabase
      .from("scores")
      .select("*")
      .eq("match_id", matchId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !current) {
      throw new HTTPException(400, {
        message: "Match not started (No score history found)",
      });
    }

    let newScoreA = current.team_a_score;
    let newScoreB = current.team_b_score;
    let servingTeam = current.serving_team_id;
    let sequence = current.server_sequence;
    let metadata = current.metadata as PickleballMetadata;

    const isServerWinner = servingTeam === body.rally_winner_team_id;

    // --- SCENARIO 1: SERVING TEAM WINS RALLY ---
    if (isServerWinner) {
      if (servingTeam === ctx.teamA_id) {
        newScoreA++;
        const temp = metadata.team_a_pos.right_player_id;
        metadata.team_a_pos.right_player_id =
          metadata.team_a_pos.left_player_id;
        metadata.team_a_pos.left_player_id = temp;
      } else {
        newScoreB++;
        const temp = metadata.team_b_pos.right_player_id;
        metadata.team_b_pos.right_player_id =
          metadata.team_b_pos.left_player_id;
        metadata.team_b_pos.left_player_id = temp;
      }
    }
    // --- SCENARIO 2: SIDE OUT ---
    else {
      if (sequence === 1) {
        sequence = 2;
      } else {
        sequence = 1;
        servingTeam =
          servingTeam === ctx.teamA_id ? ctx.teamB_id : ctx.teamA_id;
      }
    }

    const { data: newState, error: insertErr } = await supabase
      .from("scores")
      .insert({
        match_id: matchId,
        team_a_score: newScoreA,
        team_b_score: newScoreB,
        serving_team_id: servingTeam,
        server_sequence: sequence,
        metadata: metadata,
      })
      .select()
      .single();

    if (insertErr) {
      throw new HTTPException(500, { message: insertErr.message });
    }

    let matchComplete = false;
    let winnerId = null;

    if (newScoreA >= POINTS_TO_WIN && newScoreA - newScoreB >= WIN_BY) {
      matchComplete = true;
      winnerId = ctx.teamA_id;
    } else if (newScoreB >= POINTS_TO_WIN && newScoreB - newScoreA >= WIN_BY) {
      matchComplete = true;
      winnerId = ctx.teamB_id;
    }

    if (matchComplete) {
      await supabase
        .from("matches")
        .update({
          status: "completed",
          winner_team_id: winnerId,
          end_time: new Date().toISOString(),
        })
        .eq("id", matchId);

      const teamA_ids = [
        Number(metadata.team_a_pos.right_player_id),
        Number(metadata.team_a_pos.left_player_id),
      ];
      const teamB_ids = [
        Number(metadata.team_b_pos.right_player_id),
        Number(metadata.team_b_pos.left_player_id),
      ];

      await update_player_ratings_in_db(
        matchId,
        teamA_ids,
        teamB_ids,
        newScoreA,
        newScoreB,
      );
      console.log(`[Match ${matchId}] Completed. Ratings updated.`);

      // Broadcast match end event
      broadcastMatchEnd(matchId, winnerId);

      // Broadcast standings update to tournament channel
      // Get tournament ID from match
      const { data: matchData } = await supabase
        .from("matches")
        .select("tournament_id")
        .eq("id", matchId)
        .single();

      if (matchData?.tournament_id) {
        // Notify all clients subscribed to this tournament to refresh standings
        broadcastTournamentUpdate(matchData.tournament_id, "standings_update", {
          matchId,
          winnerId,
          scores: { teamA: newScoreA, teamB: newScoreB },
        });
      }
    }

    // --- Live Score Calculation & Logging ---
    const tA_ids = [
      Number(metadata.team_a_pos.right_player_id),
      Number(metadata.team_a_pos.left_player_id),
    ];
    const tB_ids = [
      Number(metadata.team_b_pos.right_player_id),
      Number(metadata.team_b_pos.left_player_id),
    ];
    const allIds = [...tA_ids, ...tB_ids];

    const { data: ratingData } = await supabase
      .from("ratings")
      .select("player_id, aura_mu, aura_sigma")
      .in("player_id", allIds);

    const getStat = (id: number) => {
      const r = ratingData?.find((x) => x.player_id === id);
      return {
        id,
        mu: r?.aura_mu ?? 25.0,
        sigma: r?.aura_sigma ?? 8.33,
      };
    };

    const teamA_stats = tA_ids.map(getStat);
    const teamB_stats = tB_ids.map(getStat);

    const muA = (teamA_stats[0].mu + teamA_stats[1].mu) / 2;
    const sigmaA = Math.sqrt(
      (Math.pow(teamA_stats[0].sigma, 2) + Math.pow(teamA_stats[1].sigma, 2)) /
        2,
    );
    const muB = (teamB_stats[0].mu + teamB_stats[1].mu) / 2;
    const sigmaB = Math.sqrt(
      (Math.pow(teamB_stats[0].sigma, 2) + Math.pow(teamB_stats[1].sigma, 2)) /
        2,
    );

    const p_blend = blended_point_prob(
      muA,
      sigmaA,
      muB,
      sigmaB,
      newScoreA,
      newScoreB,
      POINTS_TO_WIN,
    );

    const win_prob_A = match_prob_with_beta_uncertainty(
      p_blend,
      newScoreA,
      newScoreB,
      POINTS_TO_WIN,
    );

    console.log(
      `[Match ${matchId}] Point: ${newScoreA}-${newScoreB}. Win Prob Team A: ${(
        win_prob_A * 100
      ).toFixed(1)}%`,
    );

    // Broadcast score update to all connected WebSocket clients
    broadcastMatchScore(
      matchId,
      newScoreA,
      newScoreB,
      Number((win_prob_A * 100).toFixed(1)),
    );

    return c.json({
      data: {
        success: true,
        score_1_2: newScoreA,
        score_3_4: newScoreB,
        teamA: newScoreA,
        teamB: newScoreB,
        team_a_score: newScoreA,
        team_b_score: newScoreB,
        server_seq: sequence,
        is_match_over: matchComplete,
        winner_team_id: winnerId,
        positions: {
          pos_1: metadata.team_a_pos.right_player_id,
          pos_2: metadata.team_a_pos.left_player_id,
          pos_3: metadata.team_b_pos.right_player_id,
          pos_4: metadata.team_b_pos.left_player_id,
        },
      },
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    const errorMessage = (error as Error).message;
    if (errorMessage.includes("does not belong to this match")) {
      throw new HTTPException(400, { message: errorMessage });
    }
    if (errorMessage.includes("Match not started")) {
      throw new HTTPException(400, { message: errorMessage });
    }
    throw new HTTPException(500, { message: errorMessage });
  }
}

// POST /matches/:id/undo - Undo last point
export async function undoLastPoint(c: Context<AuthContext>) {
  try {
    const params = (c.req as any).valid("param") as any as z.infer<
      typeof matchIdSchema
    >;
    const matchId = parseInt(params.id);

    if (isNaN(matchId)) {
      throw new HTTPException(400, { message: "Invalid match ID" });
    }

    // Check record count
    const { count } = await supabase
      .from("scores")
      .select("*", { count: "exact", head: true })
      .eq("match_id", matchId);

    if (count !== null && count <= 1) {
      throw new HTTPException(400, {
        message: "Cannot undo. Match is at start state.",
      });
    }

    // Get latest ID to delete
    const { data: latest } = await supabase
      .from("scores")
      .select("id")
      .eq("match_id", matchId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!latest) {
      throw new HTTPException(404, { message: "No score found to undo" });
    }

    // Delete latest
    await supabase.from("scores").delete().eq("id", latest.id);

    // Fetch new current state
    const { data: current } = await supabase
      .from("scores")
      .select("*")
      .eq("match_id", matchId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!current) {
      throw new HTTPException(404, { message: "No score state found" });
    }

    // Revert match status logic
    const scoreA = current.team_a_score;
    const scoreB = current.team_b_score;
    const metadata = current.metadata as PickleballMetadata;

    const isWinA = scoreA >= POINTS_TO_WIN && scoreA - scoreB >= WIN_BY;
    const isWinB = scoreB >= POINTS_TO_WIN && scoreB - scoreA >= WIN_BY;

    // If neither is a win now, force status to in_progress and clear winner
    if (!isWinA && !isWinB) {
      await supabase
        .from("matches")
        .update({
          status: "in_progress",
          winner_team_id: null,
          end_time: null,
        })
        .eq("id", matchId);
    }

    // --- Live Score Calculation & Logging (same as recordPoint) ---
    const tA_ids = [
      Number(metadata.team_a_pos.right_player_id),
      Number(metadata.team_a_pos.left_player_id),
    ];
    const tB_ids = [
      Number(metadata.team_b_pos.right_player_id),
      Number(metadata.team_b_pos.left_player_id),
    ];
    const allIds = [...tA_ids, ...tB_ids];

    const { data: ratingData } = await supabase
      .from("ratings")
      .select("player_id, aura_mu, aura_sigma")
      .in("player_id", allIds);

    const getStat = (id: number) => {
      const r = ratingData?.find((x) => x.player_id === id);
      return {
        id,
        mu: r?.aura_mu ?? 25.0,
        sigma: r?.aura_sigma ?? 8.33,
      };
    };

    const teamA_stats = tA_ids.map(getStat);
    const teamB_stats = tB_ids.map(getStat);

    const muA = (teamA_stats[0].mu + teamA_stats[1].mu) / 2;
    const sigmaA = Math.sqrt(
      (Math.pow(teamA_stats[0].sigma, 2) + Math.pow(teamA_stats[1].sigma, 2)) /
        2,
    );
    const muB = (teamB_stats[0].mu + teamB_stats[1].mu) / 2;
    const sigmaB = Math.sqrt(
      (Math.pow(teamB_stats[0].sigma, 2) + Math.pow(teamB_stats[1].sigma, 2)) /
        2,
    );

    const p_blend = blended_point_prob(
      muA,
      sigmaA,
      muB,
      sigmaB,
      scoreA,
      scoreB,
      POINTS_TO_WIN,
    );

    const win_prob_A = match_prob_with_beta_uncertainty(
      p_blend,
      scoreA,
      scoreB,
      POINTS_TO_WIN,
    );

    console.log(
      `[Match ${matchId}] Undo: ${scoreA}-${scoreB}. Win Prob Team A: ${(
        win_prob_A * 100
      ).toFixed(1)}%`,
    );

    // Broadcast updated score after undo with win probability
    broadcastMatchScore(
      matchId,
      scoreA,
      scoreB,
      Number((win_prob_A * 100).toFixed(1)),
    );

    return c.json({
      data: {
        success: true,
        message: "Undo successful",
        score_1_2: scoreA,
        score_3_4: scoreB,
        server_seq: current.server_sequence,
      },
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// GET /matches/:id/state - Get current match state
export async function getMatchState(c: Context<AuthContext>) {
  try {
    const params = (c.req as any).valid("param") as any as z.infer<
      typeof matchIdSchema
    >;
    const matchId = parseInt(params.id);

    if (isNaN(matchId)) {
      throw new HTTPException(400, { message: "Invalid match ID" });
    }

    const { data: current, error } = await supabase
      .from("scores")
      .select("*")
      .eq("match_id", matchId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !current) {
      throw new HTTPException(404, { message: "No match data found" });
    }

    // Map back to flat positions for frontend convenience
    const meta = current.metadata as PickleballMetadata;

    return c.json({
      data: {
        ...current,
        score_1_2: current.team_a_score,
        score_3_4: current.team_b_score,
        display_positions: {
          pos_1: meta.team_a_pos.right_player_id,
          pos_2: meta.team_a_pos.left_player_id,
          pos_3: meta.team_b_pos.right_player_id,
          pos_4: meta.team_b_pos.left_player_id,
        },
      },
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

export async function getRefereeMatches(c: Context<AuthContext>) {
  try {
    const playerId = c.get("playerId");

    // First, get tournament IDs where current user is a referee
    const { data: refereeTournaments, error: refError } = await supabase
      .from("tournaments_referee")
      .select("tournament_id")
      .eq("player_id", playerId);

    if (refError) {
      throw new HTTPException(500, { message: refError.message });
    }

    const tournamentIds =
      refereeTournaments?.map((t: any) => t.tournament_id) || [];

    if (tournamentIds.length === 0) {
      return c.json({ data: { matches: [] } });
    }

    // Get matches from tournaments where user is a referee AND assigned to the match
    const { data: matches, error } = await supabase
      .from("matches")
      .select(
        `
        id,
        tournament_id,
        refree_id,
        court_id,
        winner_team_id,
        round,
        status,
        start_time,
        end_time,
        tournaments (
          id,
          name,
          description,
          image_url,
          start_time,
          end_time,
          venue:venue (
            id,
            name,
            address
          )
        ),
        courts (
          id,
          court_number
        )
      `,
      )
      .in("tournament_id", tournamentIds)
      .eq("refree_id", playerId)
      .neq("status", "bye") // Filter out bye matches - they don't need refereeing
      .order("start_time", { ascending: false });

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    // Get pairings for these matches to get team/player info
    const matchIds = matches?.map((m: any) => m.id) || [];

    if (matchIds.length === 0) {
      return c.json({ data: { matches: [] } });
    }

    const { data: pairings } = await supabase
      .from("pairings")
      .select("id, match_id")
      .in("match_id", matchIds);

    const pairingIds = pairings?.map((p: any) => p.id) || [];

    if (pairingIds.length > 0) {
      const { data: pairingTeams } = await supabase
        .from("pairing_teams")
        .select("pairing_id, team_id")
        .in("pairing_id", pairingIds);

      const teamIds =
        pairingTeams?.map((pt: any) => pt.team_id).filter(Boolean) || [];

      if (teamIds.length > 0) {
        const { data: teamMembers } = await supabase
          .from("team_members")
          .select(
            `
            team_id,
            player_id,
            players (
              id,
              username,
              photo_url
            )
          `,
          )
          .in("team_id", teamIds);

        // Get latest scores
        const { data: scores } = await supabase
          .from("scores")
          .select("match_id, team_a_score, team_b_score, created_at")
          .in("match_id", matchIds)
          .order("created_at", { ascending: false });

        // Build match details with players and scores
        const matchesWithDetails = matches?.map((match: any) => {
          const matchPairings =
            pairings?.filter((p: any) => p.match_id === match.id) || [];
          const matchPairingIds = matchPairings.map((p: any) => p.id);
          const matchPairingTeams =
            pairingTeams?.filter((pt: any) =>
              matchPairingIds.includes(pt.pairing_id),
            ) || [];
          const matchTeamIds = matchPairingTeams.map((pt: any) => pt.team_id);

          const players = matchTeamIds.flatMap((teamId: number) => {
            return (
              teamMembers
                ?.filter((tm: any) => tm.team_id === teamId)
                .map((tm: any) => {
                  const player = Array.isArray(tm.players)
                    ? tm.players[0]
                    : tm.players;
                  return {
                    id: player?.id,
                    username: player?.username,
                    team_id: teamId,
                  };
                }) || []
            );
          });

          const matchScores =
            scores?.filter((s: any) => s.match_id === match.id) || [];
          const latestScore =
            matchScores.length > 0
              ? matchScores.sort(
                  (a: any, b: any) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime(),
                )[0]
              : null;

          const tournament = Array.isArray(match.tournaments)
            ? match.tournaments[0]
            : match.tournaments;
          const court = Array.isArray(match.courts)
            ? match.courts[0]
            : match.courts;

          return {
            id: match.id,
            tournament_id: match.tournament_id,
            tournament: tournament
              ? {
                  id: tournament.id,
                  name: tournament.name,
                  description: tournament.description,
                  image_url: tournament.image_url,
                  start_time: tournament.start_time,
                  end_time: tournament.end_time,
                  venue: tournament.venue,
                }
              : null,
            round: match.round,
            status: match.status,
            court: court?.court_number || null,
            start_time: match.start_time,
            end_time: match.end_time,
            players: players || [],
            scores: latestScore
              ? {
                  teamA: latestScore.team_a_score || 0,
                  teamB: latestScore.team_b_score || 0,
                }
              : null,
          };
        });

        return c.json({ data: { matches: matchesWithDetails || [] } });
      }
    }

    // Return matches without detailed player info if no pairings found
    const matchesWithTournament = matches?.map((match: any) => {
      const tournament = Array.isArray(match.tournaments)
        ? match.tournaments[0]
        : match.tournaments;
      const court = Array.isArray(match.courts)
        ? match.courts[0]
        : match.courts;

      return {
        id: match.id,
        tournament_id: match.tournament_id,
        tournament: tournament
          ? {
              id: tournament.id,
              name: tournament.name,
              description: tournament.description,
              image_url: tournament.image_url,
              start_time: tournament.start_time,
              end_time: tournament.end_time,
              venue: tournament.venue,
            }
          : null,
        round: match.round,
        status: match.status,
        court: court?.court_number || null,
        start_time: match.start_time,
        end_time: match.end_time,
        players: [],
        scores: null,
      };
    });

    return c.json({ data: { matches: matchesWithTournament || [] } });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}
