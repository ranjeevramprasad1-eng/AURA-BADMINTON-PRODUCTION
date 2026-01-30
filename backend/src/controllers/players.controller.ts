import { HTTPException } from "hono/http-exception";
import { supabase } from "@/lib/supabase";
import type { Context } from "hono";
import type { AuthContext } from "@/middleware/auth";
import type { z } from "zod";
import type {
  playerIdSchema,
  createPlayerSchema,
  updatePlayerSchema,
} from "@/utils/validation";
import { DEFAULT_MU, DEFAULT_SIGMA } from "@/lib/rating_calculations";

// GET /players - Get all players
export async function getAllPlayers(c: Context<AuthContext>) {
  try {
    const { data: players, error } = await supabase
      .from("players")
      .select("id, username, dob, gender, photo_url, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    return c.json({ data: { players } });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// GET /players/:id - Get player by ID
export async function getPlayerById(c: Context<AuthContext>) {
  try {
    const params = (c.req as any).valid("param") as any as z.infer<
      typeof playerIdSchema
    >;
    const playerId = parseInt(params.id);

    if (isNaN(playerId)) {
      throw new HTTPException(400, { message: "Invalid player ID" });
    }

    const { data: player, error } = await supabase
      .from("players")
      .select("id, user_id, username, dob, gender, photo_url, created_at")
      .eq("id", playerId)
      .single();

    if (error || !player) {
      throw new HTTPException(404, { message: "Player not found" });
    }

    // Get rating if exists
    const { data: rating } = await supabase
      .from("ratings")
      .select("aura_mu, aura_sigma, last_updated")
      .eq("player_id", playerId)
      .single();

    if (!rating) {
      // Create default rating
      await supabase
        .from("ratings")
        .insert({
          player_id: playerId,
          aura_mu: DEFAULT_MU,
          aura_sigma: DEFAULT_SIGMA,
        })
        .select();
    }

    return c.json({
      data: {
        ...player,
        rating: rating || { aura_mu: DEFAULT_MU, aura_sigma: DEFAULT_SIGMA },
      },
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// POST /players - Create a new player
export async function createPlayer(c: Context<AuthContext>) {
  try {
    const userId = c.get("userId");
    const body = (c.req as any).valid("json") as any as z.infer<
      typeof createPlayerSchema
    >;

    // Check if player already exists for this user
    const { data: existingPlayer } = await supabase
      .from("players")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existingPlayer) {
      throw new HTTPException(409, {
        message: "Player already exists for this user",
      });
    }

    const { data: player, error } = await supabase
      .from("players")
      .insert({
        user_id: userId,
        username: body.username,
        dob: body.dob,
        gender: body.gender,
        photo_url: body.photo_url || null,
      })
      .select()
      .single();

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    return c.json({ data: player }, 201);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// PUT /players/:id - Update player
export async function updatePlayer(c: Context<AuthContext>) {
  try {
    const playerId = c.get("playerId");
    const params = (c.req as any).valid("param") as any as z.infer<
      typeof playerIdSchema
    >;
    const targetPlayerId = parseInt(params.id);
    const body = (c.req as any).valid("json") as any as z.infer<
      typeof updatePlayerSchema
    >;

    // Only allow users to update their own player profile
    if (targetPlayerId !== Number(playerId)) {
      throw new HTTPException(403, {
        message: "Not authorized to update this player",
      });
    }

    const updateData: any = {};
    if (body.username !== undefined) updateData.username = body.username;
    if (body.dob !== undefined) updateData.dob = body.dob;
    if (body.gender !== undefined) updateData.gender = body.gender;
    if (body.photo_url !== undefined)
      updateData.photo_url = body.photo_url || null;

    const { data: player, error } = await supabase
      .from("players")
      .update(updateData)
      .eq("id", targetPlayerId)
      .select()
      .single();

    if (error || !player) {
      throw new HTTPException(404, { message: "Player not found" });
    }

    return c.json({ data: player });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// DELETE /players/:id - Delete player (soft delete or hard delete)
export async function deletePlayer(c: Context<AuthContext>) {
  try {
    const playerId = c.get("playerId");
    const params = (c.req as any).valid("param") as any as z.infer<
      typeof playerIdSchema
    >;
    const targetPlayerId = parseInt(params.id);

    // Only allow users to delete their own player profile
    if (targetPlayerId !== Number(playerId)) {
      throw new HTTPException(403, {
        message: "Not authorized to delete this player",
      });
    }

    const { error } = await supabase
      .from("players")
      .delete()
      .eq("id", targetPlayerId);

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

// GET /players/search?q=query - Search players by username
export async function searchPlayers(c: Context<AuthContext>) {
  try {
    const playerId = c.get("playerId");
    const queryParams = c.req.query();
    const searchQuery = queryParams.q;

    if (!searchQuery || searchQuery.trim().length === 0) {
      throw new HTTPException(400, { message: "Search query is required" });
    }

    const { data: players, error } = await supabase
      .from("players")
      .select("id, username, photo_url")
      .ilike("username", `%${searchQuery}%`)
      .neq("id", playerId) // Exclude current player
      .limit(20)
      .order("username", { ascending: true });

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    return c.json({ data: { players: players || [] } });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}
