import { HTTPException } from "hono/http-exception";
import { supabase } from "@/lib/supabase";
import type { Context } from "hono";
import type { AuthContext } from "@/middleware/auth";
import { DEFAULT_MU, DEFAULT_SIGMA } from "@/lib/rating_calculations";

// GET /user/details - Get comprehensive user details
export async function getUserDetails(c: Context<AuthContext>) {
  try {
    const playerId = c.get("playerId");
    const email = c.get("userEmail");

    // Get player details
    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("id, username, dob, gender, photo_url, user_id")
      .eq("id", playerId)
      .single();

    if (playerError || !player) {
      throw new HTTPException(404, { message: "Player not found" });
    }

    // Calculate age
    const today = new Date();
    const birthDate = new Date(player.dob);
    const age = today.getFullYear() - birthDate.getFullYear();

    // Get aura rating
    const { data: rating } = await supabase
      .from("ratings")
      .select("aura_mu, aura_sigma")
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

    // Get tournaments where user is host
    const { data: hostedTournaments } = await supabase
      .from("tournaments")
      .select("id")
      .eq("host_id", playerId);

    const hostForTournaments = hostedTournaments?.map((t: any) => t.id) || [];

    // Get tournaments where user is referee
    const { data: refereeTournaments } = await supabase
      .from("tournaments_referee")
      .select("tournament_id")
      .eq("player_id", playerId);

    const refereeForTournaments =
      refereeTournaments?.map((r: any) => r.tournament_id) || [];

    // Get all matches for this player
    // First, get all teams this player is part of
    const { data: playerTeams } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("player_id", playerId);

    const teamIds = playerTeams?.map((pt: any) => pt.team_id) || [];

    if (teamIds.length > 0) {
      // Get pairing teams for these teams
      const { data: pairingTeams } = await supabase
        .from("pairing_teams")
        .select("pairing_id")
        .in("team_id", teamIds);

      const pairingIds = pairingTeams?.map((pt: any) => pt.pairing_id) || [];

      // Get pairings for these pairing IDs
      const { data: pairings } = await supabase
        .from("pairings")
        .select("match_id, tournament_id")
        .in("id", pairingIds);

      const matchIds =
        pairings?.map((p: any) => p.match_id).filter(Boolean) || [];
      const tournamentIds = Array.from(
        new Set(
          pairings?.map((p: any) => p.tournament_id).filter(Boolean) || [],
        ),
      );

      // Get match details
      const { data: matches } = await supabase
        .from("matches")
        .select(
          `
        id,
        tournament_id,
        status,
        court_id,
        round,
        winner_team_id,
        courts (
          court_number
        )
      `,
        )
        .in("id", matchIds);

      // Get tournament names and end times
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("id, name, end_time")
        .in("id", tournamentIds);

      const tournamentMap = new Map(
        tournaments?.map((t: any) => [
          t.id,
          { name: t.name, end_time: t.end_time },
        ]) || [],
      );

      // Get all pairings for these matches
      const { data: allPairings } = await supabase
        .from("pairings")
        .select("id, match_id")
        .in("match_id", matchIds);

      const allPairingIds = allPairings?.map((p: any) => p.id) || [];

      // Get all pairing teams
      const { data: allPairingTeams } = await supabase
        .from("pairing_teams")
        .select("pairing_id, team_id")
        .in("pairing_id", allPairingIds);

      // Get all team members for these teams
      const allTeamIds =
        allPairingTeams?.map((pt: any) => pt.team_id).filter(Boolean) || [];
      const { data: allTeamMembers } = await supabase
        .from("team_members")
        .select(
          `
        team_id,
        player_id,
        created_at,
        players (
          id,
          username,
          photo_url
        )
      `,
        )
        .in("team_id", allTeamIds);

      // Get scores for all matches
      const { data: allScores } = await supabase
        .from("scores")
        .select(
          `
        id,
        match_id,
        team_a_score,
        team_b_score,
        created_at
      `,
        )
        .in("match_id", matchIds);

      // Build match details
      const matchDetails =
        matches?.map((match: any) => {
          const matchPairings =
            allPairings?.filter((p: any) => p.match_id === match.id) || [];
          const matchScores =
            allScores?.filter((s: any) => s.match_id === match.id) || [];
          const latestScore = matchScores[matchScores.length - 1] || null;

          // Get pairing teams for this match
          const matchPairingIds = matchPairings.map((p: any) => p.id);
          const matchPairingTeams =
            allPairingTeams?.filter((pt: any) =>
              matchPairingIds.includes(pt.pairing_id),
            ) || [];

          // Get teams for this match
          const uniqueTeamIds = Array.from(
            new Set(matchPairingTeams.map((pt: any) => pt.team_id)),
          );
          const teams = uniqueTeamIds.map((teamId: number, index: number) => {
            const players =
              allTeamMembers
                ?.filter((tm: any) => tm.team_id === teamId)
                .map((tm: any) => {
                  const player = Array.isArray(tm.players)
                    ? tm.players[0]
                    : tm.players;
                  return {
                    id: player?.id,
                    name: player?.username,
                    username: player?.username,
                    team_id: teamId,
                    team: index === 0 ? "A" : "B",
                    created_at: tm.created_at,
                  };
                }) || [];
            return { team_id: teamId, players };
          });

          const allPlayers = teams.flatMap((t: any) => t.players);
          const court = Array.isArray(match.courts)
            ? match.courts[0]
            : match.courts;

          const tournamentData = tournamentMap.get(match.tournament_id) || {
            name: "",
            end_time: null,
          };

          return {
            match_id: match.id,
            tournament_id: match.tournament_id,
            tournament_name: tournamentData.name,
            tournament_end_date: tournamentData.end_time,
            round: match.round,
            status: match.status,
            court: court?.court_number || null,
            scores: {
              teamA: latestScore?.team_a_score || 0,
              teamB: latestScore?.team_b_score || 0,
            },
            players: allPlayers,
          };
        }) || [];

      return c.json({
        data: {
          id: player.id,
          name: player.username,
          username: player.username,
          email: email,
          aura: rating?.aura_mu || DEFAULT_MU,
          age: age.toString(),
          gender: player.gender,
          photo_url: player.photo_url,
          host_for_tournaments: hostForTournaments,
          referee_for_tournaments: refereeForTournaments,
          tournaments: matchDetails,
        },
      });
    } else {
      // No teams/matches found
      return c.json({
        data: {
          id: player.id,
          name: player.username,
          username: player.username,
          email: email,
          aura: rating?.aura_mu || DEFAULT_MU,
          age: age.toString(),
          gender: player.gender,
          photo_url: player.photo_url,
          host_for_tournaments: hostForTournaments,
          referee_for_tournaments: refereeForTournaments,
          tournaments: [],
        },
      });
    }
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: (error as Error).message });
  }
}
