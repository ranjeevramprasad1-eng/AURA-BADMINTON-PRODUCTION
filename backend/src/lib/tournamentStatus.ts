/**
 * ============================================================================
 * TOURNAMENT STATUS - Tournament Info Module
 * ============================================================================
 * 
 * Functions for getting tournament status, standings, and match info.
 */

import { supabase } from './supabase';
import { getTeamsFromInvites, Team } from './tournamentGroups';

// --- TYPES ---
export interface TournamentInfo {
    tournament_id: number;
    stage: 'registration' | 'group_stage' | 'knockout' | 'completed';
    current_round: number;
    total_group_rounds: number;
    format: string;
    number_of_groups: number;
    teams_registered: number;
    total_matches: number;
    completed_matches: number;
    pending_matches: number;
    groups: Record<string, number[]> | null;
    knockout_pairing_ids: number[];
}

export interface TeamStanding {
    position: number;
    team_id: number;
    name: string;
    player1_name: string;
    player2_name: string;
    wins: number;
    losses: number;
    points: number;
    total_points_scored: number;    // Total game points scored across all matches
    total_points_against: number;   // Total game points conceded
    qualified: boolean;
}

export interface MatchDetails {
    match_id: number;
    round: string;
    status: string;
    team1: { team_id: number; name: string } | null;
    team2: { team_id: number; name: string } | null;
    winner_team_id: number | null;
    winner_name: string | null;
    referee_id: number | null;
}

// ============================================================================
// TOURNAMENT INFO
// ============================================================================

/**
 * Get comprehensive tournament status
 */
export async function getTournamentInfo(tournamentId: number): Promise<TournamentInfo | null> {

    const { data: tournament, error } = await supabase
        .from('tournaments')
        .select('id, metadata')
        .eq('id', tournamentId)
        .single();

    if (error || !tournament) return null;

    const metadata = tournament.metadata as Record<string, any> | null;

    // Get match counts
    const { data: allMatches } = await supabase
        .from('matches')
        .select('id, status, round')
        .eq('tournament_id', tournamentId);

    const totalMatches = allMatches?.length || 0;
    const completedMatches = allMatches?.filter(m => m.status === 'completed').length || 0;
    const pendingMatches = totalMatches - completedMatches;

    // Get teams
    const teams = await getTeamsFromInvites(tournamentId);

    // Determine stage
    let stage: 'registration' | 'group_stage' | 'knockout' | 'completed' = 'registration';
    if (metadata?.stage) {
        stage = metadata.stage;
    } else if (metadata?.groups) {
        const hasKnockout = allMatches?.some(m => ['QF', 'SF', 'F'].includes(m.round as string));
        const finalComplete = allMatches?.some(m => m.round === 'F' && m.status === 'completed');

        if (finalComplete) stage = 'completed';
        else if (hasKnockout) stage = 'knockout';
        else stage = 'group_stage';
    }

    return {
        tournament_id: tournamentId,
        stage,
        current_round: metadata?.current_round || 0,
        total_group_rounds: metadata?.total_group_rounds || 0,
        format: metadata?.format || 'swiss', // default to swiss for existing tournaments
        number_of_groups: metadata?.number_of_groups || 0,
        teams_registered: teams.length,
        total_matches: totalMatches,
        completed_matches: completedMatches,
        pending_matches: pendingMatches,
        groups: metadata?.groups || null,
        knockout_pairing_ids: metadata?.knockout?.pairing_ids || []
    };
}

// ============================================================================
// STANDINGS
// ============================================================================

/**
 * Get standings per group with team details
 */
export async function getStandings(tournamentId: number): Promise<Record<string, TeamStanding[]>> {

    const { data: tournament } = await supabase
        .from('tournaments')
        .select('metadata')
        .eq('id', tournamentId)
        .single();

    const metadata = tournament?.metadata as Record<string, any> | null;
    if (!metadata?.groups) return {};

    const teamsToAdvance = metadata.teams_to_advance || 2;
    const teams = await getTeamsFromInvites(tournamentId);
    const teamMap = new Map(teams.map(t => [t.team_id, t]));

    const standings: Record<string, TeamStanding[]> = {};

    for (const [groupLetter, teamIds] of Object.entries(metadata.groups as Record<string, number[]>)) {
        // Get completed matches for this group (excluding BYE matches)
        const { data: groupMatches } = await supabase
            .from('matches')
            .select('id, winner_team_id, status')
            .eq('tournament_id', tournamentId)
            .like('round', `GS-${groupLetter}-%`)
            .in('status', ['completed', 'bye']);

        // Filter out BYE matches from win/loss counting
        const actualMatches = groupMatches?.filter(m => m.status === 'completed') || [];

        // Count wins per team and track points scored (only from actual played matches, not BYEs)
        const teamStats = new Map<number, { wins: number; losses: number; pointsScored: number; pointsAgainst: number }>();
        teamIds.forEach(tid => teamStats.set(tid, { wins: 0, losses: 0, pointsScored: 0, pointsAgainst: 0 }));

        // Get all teams in each match to count wins/losses and total points scored
        if (actualMatches.length > 0) {
            for (const match of actualMatches) {
                const { data: pairing } = await supabase
                    .from('pairings')
                    .select('id')
                    .eq('match_id', match.id)
                    .single();

                if (!pairing) continue;

                const { data: pairingTeams } = await supabase
                    .from('pairing_teams')
                    .select('team_id')
                    .eq('pairing_id', pairing.id)
                    .order('team_id', { ascending: true }); // Ensure consistent ordering: first = team_a, second = team_b

                if (!pairingTeams || pairingTeams.length < 2) continue;

                // Get final score for this match (latest score entry)
                const { data: latestScore } = await supabase
                    .from('scores')
                    .select('team_a_score, team_b_score')
                    .eq('match_id', match.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                // Map team_a/team_b to actual team IDs based on pairing order
                const teamAId = pairingTeams[0].team_id;
                const teamBId = pairingTeams[1].team_id;
                const teamAScore = latestScore?.team_a_score ?? 0;
                const teamBScore = latestScore?.team_b_score ?? 0;

                // Update stats for each team
                for (const pt of pairingTeams) {
                    const stats = teamStats.get(pt.team_id);
                    if (!stats) continue;

                    // Count wins/losses
                    if (pt.team_id === match.winner_team_id) {
                        stats.wins++;
                    } else if (match.winner_team_id) {
                        stats.losses++;
                    }

                    // Add points scored/against
                    if (pt.team_id === teamAId) {
                        stats.pointsScored += teamAScore;
                        stats.pointsAgainst += teamBScore;
                    } else {
                        stats.pointsScored += teamBScore;
                        stats.pointsAgainst += teamAScore;
                    }
                }
            }
        }

        // Build standings
        const groupStandings: TeamStanding[] = teamIds.map(tid => {
            const team = teamMap.get(tid);
            const stats = teamStats.get(tid) || { wins: 0, losses: 0, pointsScored: 0, pointsAgainst: 0 };

            return {
                position: 0, // Will be set after sorting
                team_id: tid,
                name: team?.display_name || `Team ${tid}`,
                player1_name: team?.player1_name || 'Unknown',
                player2_name: team?.player2_name || 'Unknown',
                wins: stats.wins,
                losses: stats.losses,
                points: stats.wins * 3, // 3 points per win
                total_points_scored: stats.pointsScored,
                total_points_against: stats.pointsAgainst,
                qualified: false
            };
        });

        // Sort by wins DESC, then by total_points_scored DESC (tiebreaker), then team_id
        groupStandings.sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (b.total_points_scored !== a.total_points_scored) return b.total_points_scored - a.total_points_scored;
            return a.team_id - b.team_id;
        });

        // Calculate total matches played in this group (actual matches, not BYEs)
        const totalMatchesPlayed = actualMatches.length;
        // Total matches needed = n*(n-1)/2 for round-robin where n = teams in group
        const teamsInGroup = teamIds.length;
        const totalMatchesNeeded = (teamsInGroup * (teamsInGroup - 1)) / 2;
        const groupComplete = totalMatchesPlayed >= totalMatchesNeeded && totalMatchesNeeded > 0;

        // Set positions and qualified status
        // Only show "qualified" if group stage is complete OR team has mathematically qualified
        groupStandings.forEach((s, idx) => {
            s.position = idx + 1;
            // Only mark as qualified if:
            // 1. Group is complete and team is in top positions, OR
            // 2. Team has enough wins that they can't be caught (mathematical qualification)
            if (groupComplete) {
                s.qualified = idx < teamsToAdvance;
            } else if (totalMatchesPlayed > 0) {
                // Check if team has mathematically qualified
                // A team qualifies if even if all remaining teams win all their games, 
                // this team would still be in top teamsToAdvance
                // For simplicity, only show qualified if group is complete
                s.qualified = false;
            } else {
                // No matches played yet - no one is qualified
                s.qualified = false;
            }
        });

        standings[`Group ${groupLetter}`] = groupStandings;
    }

    return standings;
}

// ============================================================================
// REGISTERED TEAMS WITH DETAILS
// ============================================================================

/**
 * Get all registered teams with group assignments
 */
export async function getRegisteredTeams(tournamentId: number): Promise<{
    teams: Team[];
    groups: Record<string, Team[]> | null;
}> {
    const teams = await getTeamsFromInvites(tournamentId);

    const { data: tournament } = await supabase
        .from('tournaments')
        .select('metadata')
        .eq('id', tournamentId)
        .single();

    const metadata = tournament?.metadata as Record<string, any> | null;

    if (!metadata?.groups) {
        return { teams, groups: null };
    }

    // Map teams to groups
    const teamMap = new Map(teams.map(t => [t.team_id, t]));
    const groups: Record<string, Team[]> = {};

    for (const [groupLetter, teamIds] of Object.entries(metadata.groups as Record<string, number[]>)) {
        groups[`Group ${groupLetter}`] = teamIds
            .map(tid => teamMap.get(tid))
            .filter((t): t is Team => t !== undefined);
    }

    return { teams, groups };
}

// ============================================================================
// MATCHES
// ============================================================================

/**
 * Get all matches for tournament
 */
export async function getMatches(
    tournamentId: number,
    filter?: { round?: string; status?: string }
): Promise<MatchDetails[]> {

    let query = supabase
        .from('matches')
        .select('id, round, status, winner_team_id, refree_id')
        .eq('tournament_id', tournamentId)
        .order('id');

    if (filter?.round) {
        query = query.eq('round', filter.round);
    }
    if (filter?.status) {
        query = query.eq('status', filter.status);
    }

    const { data: matches, error: matchesError } = await query;

    console.log(`\n=== getMatches DEBUG ===`);
    console.log(`Tournament ID: ${tournamentId}`);
    console.log(`Filter: ${JSON.stringify(filter)}`);
    console.log(`Query returned ${matches?.length || 0} matches`);
    console.log(`Error: ${matchesError?.message || 'none'}`);
    if (matches && matches.length > 0) {
        console.log(`First match: ${JSON.stringify(matches[0])}`);
    }
    console.log(`========================\n`);

    if (!matches || matches.length === 0) {
        return [];
    }

    // Get teams - this now pulls from metadata.groups + invites
    const teams = await getTeamsFromInvites(tournamentId);
    const teamMap = new Map(teams.map(t => [t.team_id, t]));

    console.log(`getMatches: Found ${teams.length} teams for tournament ${tournamentId}`);

    const result: MatchDetails[] = [];

    for (const match of matches) {
        // Get teams for this match via pairings
        const { data: pairing, error: pairingError } = await supabase
            .from('pairings')
            .select('id')
            .eq('match_id', match.id)
            .single();

        let team1: { team_id: number; name: string } | null = null;
        let team2: { team_id: number; name: string } | null = null;
        let winnerName: string | null = null;

        if (pairingError) {
            console.log(`No pairing found for match ${match.id}: ${pairingError.message}`);
        }

        if (pairing) {
            const { data: pairingTeams, error: ptError } = await supabase
                .from('pairing_teams')
                .select('team_id')
                .eq('pairing_id', pairing.id)
                .order('team_id');

            if (ptError) {
                console.log(`Error getting pairing_teams for pairing ${pairing.id}: ${ptError.message}`);
            }

            if (pairingTeams && pairingTeams.length >= 1) {
                const t1 = teamMap.get(pairingTeams[0].team_id);
                team1 = {
                    team_id: pairingTeams[0].team_id,
                    name: t1?.display_name || `Team ${pairingTeams[0].team_id}`
                };
                if (!t1) {
                    console.log(`Team ${pairingTeams[0].team_id} not found in teamMap`);
                }
            }
            if (pairingTeams && pairingTeams.length >= 2) {
                const t2 = teamMap.get(pairingTeams[1].team_id);
                team2 = {
                    team_id: pairingTeams[1].team_id,
                    name: t2?.display_name || `Team ${pairingTeams[1].team_id}`
                };
                if (!t2) {
                    console.log(`Team ${pairingTeams[1].team_id} not found in teamMap`);
                }
            }

            if (match.winner_team_id) {
                const winner = teamMap.get(match.winner_team_id);
                winnerName = winner?.display_name || `Team ${match.winner_team_id}`;
            }
        }

        result.push({
            match_id: match.id,
            round: match.round as string,
            status: match.status as string,
            team1,
            team2,
            winner_team_id: match.winner_team_id,
            winner_name: winnerName,
            referee_id: (match as any).refree_id ?? null  // Note: DB column has typo "refree_id"
        });
    }

    console.log(`getMatches: Returning ${result.length} processed matches`);
    return result;
}

/**
 * Get pending matches only
 */
export async function getPendingMatches(tournamentId: number): Promise<MatchDetails[]> {
    return getMatches(tournamentId, { status: 'scheduled' });
}

/**
 * Get next action needed
 */
export async function getNextAction(tournamentId: number): Promise<{
    action: string;
    canProceed: boolean;
    details?: any;
}> {
    const info = await getTournamentInfo(tournamentId);

    if (!info) {
        return { action: 'Tournament not found', canProceed: false };
    }

    // Swiss format - use existing pairing logic
    if (info.format === 'swiss' || !info.format || info.format === 'unknown') {
        return {
            action: 'Use Swiss pairing system (/pairings/generate-round)',
            canProceed: true,
            details: { format: 'swiss' }
        };
    }

    // Group + Knockout format
    if (info.stage === 'registration') {
        if (info.teams_registered < 4) {
            return {
                action: `Add more teams (have ${info.teams_registered}, need at least 4)`,
                canProceed: false,
                details: { teamsRegistered: info.teams_registered }
            };
        }
        return {
            action: 'Initialize groups',
            canProceed: true,
            details: { teamsRegistered: info.teams_registered }
        };
    }

    if (info.pending_matches > 0) {
        return {
            action: `Complete ${info.pending_matches} pending matches`,
            canProceed: false,
            details: { pendingMatches: info.pending_matches }
        };
    }

    if (info.stage === 'group_stage') {
        if (info.current_round < info.total_group_rounds) {
            return {
                action: `Start Round ${info.current_round + 1} (group stage)`,
                canProceed: true,
                details: { nextRound: info.current_round + 1 }
            };
        }
        return {
            action: 'Start knockout stage',
            canProceed: true,
            details: { stage: 'knockout' }
        };
    }

    if (info.stage === 'knockout') {
        return {
            action: 'Continue knockout (SF or Final)',
            canProceed: true,
            details: { stage: 'knockout' }
        };
    }

    if (info.stage === 'completed') {
        return {
            action: 'Tournament complete!',
            canProceed: false,
            details: { stage: 'completed' }
        };
    }

    return { action: 'Unknown state', canProceed: false };
}

