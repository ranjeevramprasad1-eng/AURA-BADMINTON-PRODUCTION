import { HTTPException } from "hono/http-exception";
import { supabase } from "@/lib/supabase";
import type { Context } from "hono";
import type { AuthContext } from "@/middleware/auth";
import type { z } from "zod";
import type {
  tournamentIdSchema,
  tournamentInviteIdSchema,
  tournamentInviteTokenSchema,
  createTournamentInviteSchema,
  updateTournamentInviteSchema,
} from "@/utils/validation";
import { randomUUID } from "crypto";

/**
 * After an invite is accepted, delete all other pending invites for this tournament
 * where either player (inviter or invitee) is involved. Keeps the accepted invite (already status "accepted").
 */
async function deleteRedundantPendingInvites(
  tournamentId: number,
  player1Id: number,
  player2Id: number
): Promise<void> {
  const { data: toDelete } = await supabase
    .from("tournament_invites")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("status", "pending")
    .or(`inviter_id.in.(${player1Id},${player2Id}),invitee_id.in.(${player1Id},${player2Id})`);

  if (toDelete?.length) {
    await supabase
      .from("tournament_invites")
      .delete()
      .in("id", toDelete.map((r) => r.id));
  }
}

// POST /tournaments/:id/invite - Invite friend to tournament team
export async function inviteToTournament(c: Context<AuthContext>) {
  try {
    const playerId = c.get("playerId");
    const params = ((c.req as any).valid("param") as any) as z.infer<typeof tournamentIdSchema>;
    const body = ((c.req as any).valid("json") as any) as z.infer<typeof createTournamentInviteSchema>;
    const tournamentId = parseInt(params.id);

    if (isNaN(tournamentId)) {
      throw new HTTPException(400, { message: "Invalid tournament ID" });
    }

    // Get tournament and match format
    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select(
        `
        id,
        name,
        capacity,
        match_format:match_format (
          id,
          type
        )
      `
      )
      .eq("id", tournamentId)
      .single();

    if (tournamentError || !tournament) {
      throw new HTTPException(404, { message: "Tournament not found" });
    }

    const matchFormat = Array.isArray(tournament.match_format)
      ? tournament.match_format[0]
      : tournament.match_format;

    // Check if tournament is doubles
    const isDoubles = matchFormat?.type?.toLowerCase().includes("doubles") || false;
    if (!isDoubles) {
      throw new HTTPException(400, { message: "Team invites are only available for doubles tournaments" });
    }

    // Check if inviter is already registered
    const { data: existingRegistration } = await supabase
      .from("registrations")
      .select("id, team_id")
      .eq("tournament_id", tournamentId)
      .eq("player_id", playerId)
      .single();

    let teamId = body.team_id || existingRegistration?.team_id;

    // If no team exists, create one
    if (!teamId) {
      const { data: newTeam, error: teamError } = await supabase
        .from("teams")
        .insert({ tournament_id: tournamentId })
        .select()
        .single();

      if (teamError || !newTeam) {
        throw new HTTPException(500, { message: "Failed to create team" });
      }

      teamId = newTeam.team_id;

      // Add inviter to team
      await supabase.from("team_members").insert({
        team_id: teamId,
        player_id: playerId,
        created_at: new Date().toISOString(),
      });
    }

    // Verify invitee exists if provided
    if (body.invitee_id) {
      const { data: invitee, error: inviteeError } = await supabase
        .from("players")
        .select("id, username")
        .eq("id", body.invitee_id)
        .single();

      if (inviteeError || !invitee) {
        throw new HTTPException(404, { message: "Invitee not found" });
      }

      // Check if invite already exists
      const { data: existingInvite } = await supabase
        .from("tournament_invites")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("inviter_id", playerId)
        .eq("invitee_id", body.invitee_id)
        .eq("status", "pending")
        .single();

      if (existingInvite) {
        throw new HTTPException(409, { message: "Invite already sent to this player" });
      }

      // Create invite
      const { data: invite, error: inviteError } = await supabase
        .from("tournament_invites")
        .insert({
          tournament_id: tournamentId,
          inviter_id: playerId,
          invitee_id: body.invitee_id,
          team_id: teamId,
          status: "pending",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        })
        .select()
        .single();

      if (inviteError) {
        throw new HTTPException(500, { message: inviteError.message });
      }

      // Create notification
      const { data: inviterPlayer } = await supabase
        .from("players")
        .select("username")
        .eq("id", playerId)
        .single();

      await supabase.from("notifications").insert({
        player_id: body.invitee_id,
        type: "tournament_invite",
        reference_id: String(invite.id),
        title: "Tournament Invitation",
        message: `${inviterPlayer?.username || "Someone"} invited you to join ${tournament.name}`,
        read: false,
      });

      return c.json({ data: invite }, 201);
    } else {
      throw new HTTPException(400, { message: "invitee_id is required for platform user invites" });
    }
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// POST /tournaments/:id/invite/link - Generate shareable invite link
export async function generateShareableLink(c: Context<AuthContext>) {
  try {
    const playerId = c.get("playerId");
    const params = ((c.req as any).valid("param") as any) as z.infer<typeof tournamentIdSchema>;
    const body = ((c.req as any).valid("json") as any) as z.infer<typeof createTournamentInviteSchema>;
    const tournamentId = parseInt(params.id);

    if (isNaN(tournamentId)) {
      throw new HTTPException(400, { message: "Invalid tournament ID" });
    }

    // Get tournament and match format
    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select(
        `
        id,
        name,
        match_format:match_format (
          id,
          type
        )
      `
      )
      .eq("id", tournamentId)
      .single();

    if (tournamentError || !tournament) {
      throw new HTTPException(404, { message: "Tournament not found" });
    }

    const matchFormat = Array.isArray(tournament.match_format)
      ? tournament.match_format[0]
      : tournament.match_format;

    // Check if tournament is doubles
    const isDoubles = matchFormat?.type?.toLowerCase().includes("doubles") || false;
    if (!isDoubles) {
      throw new HTTPException(400, { message: "Team invites are only available for doubles tournaments" });
    }

    // Check if inviter is already registered
    const { data: existingRegistration } = await supabase
      .from("registrations")
      .select("id, team_id")
      .eq("tournament_id", tournamentId)
      .eq("player_id", playerId)
      .single();

    let teamId = body.team_id || existingRegistration?.team_id;

    // If no team exists, create one
    if (!teamId) {
      const { data: newTeam, error: teamError } = await supabase
        .from("teams")
        .insert({ tournament_id: tournamentId })
        .select()
        .single();

      if (teamError || !newTeam) {
        throw new HTTPException(500, { message: "Failed to create team" });
      }

      teamId = newTeam.team_id;

      // Add inviter to team
      await supabase.from("team_members").insert({
        team_id: teamId,
        player_id: playerId,
        created_at: new Date().toISOString(),
      });
    }

    // Generate unique token
    const token = randomUUID();

    // Create invite with token
    const { data: invite, error: inviteError } = await supabase
      .from("tournament_invites")
      .insert({
        tournament_id: tournamentId,
        inviter_id: playerId,
        invitee_id: null,
        token: token,
        team_id: teamId,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .select()
      .single();

    if (inviteError) {
      throw new HTTPException(500, { message: inviteError.message });
    }

    return c.json({
      data: {
        invite,
        link: `/tournaments/invite/${token}`,
      },
    }, 201);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// GET /tournaments/invites/:token - Get invite details by token (PUBLIC - no auth required)
export async function getInviteByToken(c: Context) {
  try {
    const params = ((c.req as any).valid("param") as any) as z.infer<typeof tournamentInviteTokenSchema>;
    const token = params.token;

    const { data: invite, error } = await supabase
      .from("tournament_invites")
      .select(
        `
        id,
        tournament_id,
        inviter_id,
        team_id,
        status,
        expires_at,
        created_at,
        tournament:tournaments (
          id,
          name,
          description,
          image_url,
          start_time,
          end_time
        ),
        inviter:players!tournament_invites_inviter_id_fkey (
          id,
          username,
          photo_url
        )
      `
      )
      .eq("token", token)
      .single();

    // Fetch team members if team exists
    let teamWithMembers = null;
    if (invite?.team_id) {
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select(
          `
          id,
          player:players (
            id,
            username,
            photo_url
          )
        `
        )
        .eq("team_id", invite.team_id);

      teamWithMembers = {
        team_id: invite.team_id,
        members: teamMembers || [],
      };
    }

    if (error || !invite) {
      throw new HTTPException(404, { message: "Invite not found" });
    }

    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      // Update status to expired
      await supabase
        .from("tournament_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);

      throw new HTTPException(410, { message: "Invite has expired" });
    }

    // Return invite data regardless of status - frontend will handle display based on status
    return c.json({ data: { ...invite, team: teamWithMembers } });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// POST /tournaments/invites/:token/accept - Accept invite via token (for new users)
export async function acceptInviteByToken(c: Context<AuthContext>) {
  try {
    const playerId = c.get("playerId");
    const params = ((c.req as any).valid("param") as any) as z.infer<typeof tournamentInviteTokenSchema>;
    const token = params.token;

    // Get invite
    const { data: invite, error: inviteError } = await supabase
      .from("tournament_invites")
      .select(
        `
        id,
        tournament_id,
        inviter_id,
        team_id,
        status,
        expires_at
      `
      )
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      throw new HTTPException(404, { message: "Invite not found" });
    }

    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await supabase
        .from("tournament_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);
      throw new HTTPException(410, { message: "Invite has expired" });
    }

    if (invite.status !== "pending") {
      throw new HTTPException(400, { message: `Invite is ${invite.status}` });
    }

    // Inviter cannot accept their own invite (only the person who received the link should accept)
    if (invite.inviter_id === playerId) {
      throw new HTTPException(403, {
        message: "You cannot accept an invite you sent. Share the link with your partner to join.",
      });
    }

    // Update invite - clear token when setting invitee_id due to DB constraint
    const { data: updatedInvite, error: updateError } = await supabase
      .from("tournament_invites")
      .update({
        status: "accepted",
        invitee_id: playerId,
        token: null, // Must be null when invitee_id is set (constraint: invitee_or_token)
      })
      .eq("id", invite.id)
      .select()
      .single();

    if (updateError) {
      throw new HTTPException(500, { message: updateError.message });
    }

    // Add player to team
    const { error: teamMemberError } = await supabase
      .from("team_members")
      .insert({
        team_id: invite.team_id,
        player_id: playerId,
        created_at: new Date().toISOString(),
      });

    if (teamMemberError) {
      // Check if already in team
      const { data: existingMember } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", invite.team_id)
        .eq("player_id", playerId)
        .single();

      if (!existingMember) {
        throw new HTTPException(500, { message: teamMemberError.message });
      }
    }

    // Auto-register team for the tournament after team is complete
    // Get all team members
    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("player_id")
      .eq("team_id", invite.team_id);

    // If team has 2 members (complete for doubles), auto-register
    if (teamMembers && teamMembers.length === 2) {
      // Check tournament capacity
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("id, capacity")
        .eq("id", invite.tournament_id)
        .single();

      if (tournament) {
        // Count existing registrations
        const { count: registrationCount } = await supabase
          .from("registrations")
          .select("*", { count: "exact", head: true })
          .eq("tournament_id", invite.tournament_id);

        // Check if there's space (for doubles, each team counts as 1 spot but has 2 players)
        const currentTeamCount = Math.floor((registrationCount || 0) / 2);

        if (currentTeamCount < tournament.capacity) {
          // Register both team members
          for (const member of teamMembers) {
            // Check if player is already registered
            const { data: existingReg } = await supabase
              .from("registrations")
              .select("id")
              .eq("tournament_id", invite.tournament_id)
              .eq("player_id", member.player_id)
              .single();

            if (!existingReg) {
              await supabase
                .from("registrations")
                .insert({
                  tournament_id: invite.tournament_id,
                  player_id: member.player_id,
                  txn_id: null,
                });
            }
          }
        }
      }
    }

    // Delete other pending invites for this tournament involving either player
    await deleteRedundantPendingInvites(
      Number(invite.tournament_id),
      Number(invite.inviter_id),
      Number(playerId)
    );

    return c.json({ data: updatedInvite });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// PUT /tournaments/invites/:id - Accept/reject invite (for platform users)
export async function updateTournamentInvite(c: Context<AuthContext>) {
  try {
    const playerId = c.get("playerId");
    const params = ((c.req as any).valid("param") as any) as z.infer<typeof tournamentInviteIdSchema>;
    const body = ((c.req as any).valid("json") as any) as z.infer<typeof updateTournamentInviteSchema>;
    const inviteId = parseInt(params.id);

    if (isNaN(inviteId)) {
      throw new HTTPException(400, { message: "Invalid invite ID" });
    }

    // Get invite
    const { data: invite, error: inviteError } = await supabase
      .from("tournament_invites")
      .select("id, tournament_id, inviter_id, invitee_id, team_id, status, expires_at")
      .eq("id", inviteId)
      .single();

    if (inviteError || !invite) {
      throw new HTTPException(404, { message: "Invite not found" });
    }


    if (invite.status !== "pending") {
      throw new HTTPException(400, { message: "Invite is not pending" });
    }

    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await supabase
        .from("tournament_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);
      throw new HTTPException(410, { message: "Invite has expired" });
    }

    // Update invite
    const { data: updatedInvite, error: updateError } = await supabase
      .from("tournament_invites")
      .update({ status: body.status })
      .eq("id", inviteId)
      .select()
      .single();

    if (updateError) {
      throw new HTTPException(500, { message: updateError.message });
    }

    // If accepted, add player to team
    if (body.status === "accepted") {
      const { error: teamMemberError } = await supabase
        .from("team_members")
        .insert({
          team_id: invite.team_id,
          player_id: playerId,
          created_at: new Date().toISOString(),
        });

      if (teamMemberError) {
        // Check if already in team
        const { data: existingMember } = await supabase
          .from("team_members")
          .select("id")
          .eq("team_id", invite.team_id)
          .eq("player_id", playerId)
          .single();

        if (!existingMember) {
          throw new HTTPException(500, { message: teamMemberError.message });
        }
      }
    }

    // Delete other pending invites for this tournament involving either player
    if (body.status === "accepted" && invite.invitee_id != null) {
      await deleteRedundantPendingInvites(
        Number(invite.tournament_id),
        Number(invite.inviter_id),
        Number(invite.invitee_id)
      );
    }

    return c.json({ data: updatedInvite });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}

// GET /tournaments/:id/invites - Get all invites for a tournament
export async function getTournamentInvites(c: Context<AuthContext>) {
  try {
    const playerId = c.get("playerId");
    const params = ((c.req as any).valid("param") as any) as z.infer<typeof tournamentIdSchema>;
    const tournamentId = parseInt(params.id);

    if (isNaN(tournamentId)) {
      throw new HTTPException(400, { message: "Invalid tournament ID" });
    }

    // Get invites where user is inviter or invitee
    const { data: invites, error } = await supabase
      .from("tournament_invites")
      .select(
        `
        id,
        tournament_id,
        inviter_id,
        invitee_id,
        token,
        team_id,
        status,
        expires_at,
        created_at,
        invitee:players!tournament_invites_invitee_id_fkey (
          id,
          username,
          photo_url
        ),
        inviter:players!tournament_invites_inviter_id_fkey (
          id,
          username,
          photo_url
        )
      `
      )
      .eq("tournament_id", tournamentId)
      .or(`inviter_id.eq.${playerId},invitee_id.eq.${playerId}`)
      .order("created_at", { ascending: false });

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    return c.json({ data: { invites: invites || [] } });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}





