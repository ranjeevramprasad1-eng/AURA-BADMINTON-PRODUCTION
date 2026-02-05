import { HTTPException } from "hono/http-exception";
import { supabase } from "@/lib/supabase";
import type { Context } from "hono";
import type { AuthContext } from "@/middleware/auth";
import type { z } from "zod";
import type {
  scoreIdSchema,
  createScoreSchema,
  updateScoreSchema,
  matchIdSchema,
} from "@/utils/validation";

// GET /scores - Get all scores (with optional match_id filter)
export async function getAllScores(c: Context<AuthContext>) {
  try {
    const matchId = c.req.query("match_id");

    let query = supabase
      .from("scores")
      .select(
        `
        id,
        match_id,
        team_a_score,
        team_b_score,
        serving_team_id,
        server_sequence,
        metadata,
        created_at,
        matches (
          id,
          tournament_id,
          round
        )
      `
      )
      .order("created_at", { ascending: false });

    if (matchId) {
      query = query.eq("match_id", parseInt(matchId));
    }

    const { data: scores, error } = await query;

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    return c.json({ data: { scores } });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// GET /matches/:id/scores - Get all scores for a match
export async function getMatchScores(c: Context<AuthContext>) {
  try {
    const params = ((c.req as any).valid("param") as any) as z.infer<typeof matchIdSchema>;
    const matchId = parseInt(params.id);

    if (isNaN(matchId)) {
      throw new HTTPException(400, { message: "Invalid match ID" });
    }

    // Verify match exists
    const { data: match } = await supabase
      .from("matches")
      .select("id")
      .eq("id", matchId)
      .single();

    if (!match) {
      throw new HTTPException(404, { message: "Match not found" });
    }

    const { data: scores, error } = await supabase
      .from("scores")
      .select("*")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    return c.json({ data: { scores: scores || [] } });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// POST /scores - Create a new score
export async function createScore(c: Context<AuthContext>) {
  try {
    const body = ((c.req as any).valid("json") as any) as z.infer<typeof createScoreSchema>;

    // Verify match exists
    const { data: match } = await supabase
      .from("matches")
      .select("id, status")
      .eq("id", body.match_id)
      .single();

    if (!match) {
      throw new HTTPException(404, { message: "Match not found" });
    }

    // Verify serving team exists if provided
    if (body.serving_team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("team_id")
        .eq("team_id", body.serving_team_id)
        .single();

      if (!team) {
        throw new HTTPException(404, { message: "Serving team not found" });
      }
    }

    const { data: score, error } = await supabase
      .from("scores")
      .insert({
        match_id: body.match_id,
        team_a_score: body.team_a_score || 0,
        team_b_score: body.team_b_score || 0,
        serving_team_id: body.serving_team_id || null,
        server_sequence: body.server_sequence ? parseInt(body.server_sequence) : null,
        metadata: body.metadata || null,
      })
      .select()
      .single();

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    // If match was paused, set back to in_progress when score is updated
    if (match.status === "paused") {
      await supabase
        .from("matches")
        .update({ status: "in_progress" })
        .eq("id", body.match_id);
    }

    return c.json({ data: score }, 201);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// PUT /scores/:id - Update score
export async function updateScore(c: Context<AuthContext>) {
  try {
    const params = ((c.req as any).valid("param") as any) as z.infer<typeof scoreIdSchema>;
    const scoreId = parseInt(params.id);
    const body = ((c.req as any).valid("json") as any) as z.infer<typeof updateScoreSchema>;

    if (isNaN(scoreId)) {
      throw new HTTPException(400, { message: "Invalid score ID" });
    }

    // Verify score exists and get match_id for status update
    const { data: existingScore } = await supabase
      .from("scores")
      .select("id, match_id")
      .eq("id", scoreId)
      .single();

    if (!existingScore) {
      throw new HTTPException(404, { message: "Score not found" });
    }

    // Verify serving team exists if provided
    if (body.serving_team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("team_id")
        .eq("team_id", body.serving_team_id)
        .single();

      if (!team) {
        throw new HTTPException(404, { message: "Serving team not found" });
      }
    }

    const updateData: any = {};
    if (body.team_a_score !== undefined) updateData.team_a_score = body.team_a_score;
    if (body.team_b_score !== undefined) updateData.team_b_score = body.team_b_score;
    if (body.serving_team_id !== undefined) updateData.serving_team_id = body.serving_team_id;
    if (body.server_sequence !== undefined)
      updateData.server_sequence = body.server_sequence ? parseInt(body.server_sequence) : null;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    const { data: score, error } = await supabase
      .from("scores")
      .update(updateData)
      .eq("id", scoreId)
      .select()
      .single();

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    // If match was paused, set back to in_progress when score is updated
    const { data: match } = await supabase
      .from("matches")
      .select("status")
      .eq("id", existingScore.match_id)
      .single();
    if (match?.status === "paused") {
      await supabase
        .from("matches")
        .update({ status: "in_progress" })
        .eq("id", existingScore.match_id);
    }

    return c.json({ data: score });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// DELETE /scores/:id - Delete score
export async function deleteScore(c: Context<AuthContext>) {
  try {
    const params = ((c.req as any).valid("param") as any) as z.infer<typeof scoreIdSchema>;
    const scoreId = parseInt(params.id);

    if (isNaN(scoreId)) {
      throw new HTTPException(400, { message: "Invalid score ID" });
    }

    const { error } = await supabase.from("scores").delete().eq("id", scoreId);

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

