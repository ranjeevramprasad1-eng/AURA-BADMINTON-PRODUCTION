/**
 * ============================================================================
 * TOURNAMENT ROUNDS - Round Progression Module
 * ============================================================================
 * 
 * Functions for starting the next round (auto-detects group vs knockout).
 * Handles round-robin group pairings and knockout bracket progression.
 */

import { supabase } from './supabase';
import { getTeamsFromInvites, Team } from './tournamentGroups';

// --- TYPES ---
export interface RoundResult {
    success: boolean;
    round: string;
    roundNumber: number;
    stage: 'group_stage' | 'knockout';
    matchesCreated: number;
    matches: MatchInfo[];
    message: string;
}

export interface MatchInfo {
    match_id: number;
    pairing_id: number;
    team1: { team_id: number; name: string };
    team2: { team_id: number; name: string } | null; // null for BYE
    round: string;
    status: string;
}

// ============================================================================
// HELPER: Round-Robin Schedule Generator
// ============================================================================

function generateRoundRobinSchedule(teamIds: number[]): { pairs: [number, number][]; byeTeam: number | null }[] {
    const teams = [...teamIds];
    const n = teams.length;

    if (n < 2) return [];

    // Add dummy if odd
    if (n % 2 !== 0) {
        teams.push(-1); // -1 = BYE
    }

    const numTeams = teams.length;
    const numRounds = numTeams - 1;
    const schedule: { pairs: [number, number][]; byeTeam: number | null }[] = [];

    for (let round = 0; round < numRounds; round++) {
        const pairs: [number, number][] = [];
        let byeTeam: number | null = null;

        for (let i = 0; i < numTeams / 2; i++) {
            const home = teams[i];
            const away = teams[numTeams - 1 - i];

            if (home === -1) {
                byeTeam = away;
            } else if (away === -1) {
                byeTeam = home;
            } else {
                pairs.push([home, away]);
            }
        }

        schedule.push({ pairs, byeTeam });

        // Rotate: keep first fixed, rotate rest
        const last = teams.pop()!;
        teams.splice(1, 0, last);
    }

    return schedule;
}

// ============================================================================
// HELPER: Get Team Display Name
// ============================================================================

async function getTeamMap(tournamentId: number): Promise<Map<number, Team>> {
    const teams = await getTeamsFromInvites(tournamentId);
    return new Map(teams.map(t => [t.team_id, t]));
}

// ============================================================================
// MAIN FUNCTION: Start Next Round
// ============================================================================

/**
 * Start the next round (auto-detects group stage vs knockout)
 * 
 * @param tournamentId - Tournament ID
 * @returns RoundResult with created matches
 */
export async function startNextRound(tournamentId: number): Promise<RoundResult> {

    // 1. Get tournament metadata
    const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .select('id, metadata')
        .eq('id', tournamentId)
        .single();

    if (tournamentError || !tournament) {
        return {
            success: false, round: '', roundNumber: 0, stage: 'group_stage',
            matchesCreated: 0, matches: [], message: 'Tournament not found'
        };
    }

    const metadata = tournament.metadata as Record<string, any> | null;

    if (!metadata?.groups) {
        return {
            success: false, round: '', roundNumber: 0, stage: 'group_stage',
            matchesCreated: 0, matches: [], message: 'Groups not initialized. Call initializeGroups first.'
        };
    }

    const currentRound = metadata.current_round || 0;
    const totalGroupRounds = metadata.total_group_rounds || 3;
    const stage = metadata.stage || 'group_stage';

    // 2. Check if current round is complete (all non-bye matches must be completed)
    if (currentRound > 0) {
        const { data: incompleteMatches } = await supabase
            .from('matches')
            .select('id, status')
            .eq('tournament_id', tournamentId)
            .in('status', ['scheduled', 'in_progress', 'paused']);

        if (incompleteMatches && incompleteMatches.length > 0) {
            return {
                success: false,
                round: `R${currentRound}`,
                roundNumber: currentRound,
                stage: stage as 'group_stage' | 'knockout',
                matchesCreated: 0,
                matches: [],
                message: `Complete ${incompleteMatches.length} pending matches first`
            };
        }
    }

    // 3. Decide: Group stage or Knockout?
    if (stage === 'group_stage' && currentRound < totalGroupRounds) {
        return await startGroupRound(tournamentId, metadata, currentRound + 1);
    } else if (stage === 'group_stage' && currentRound >= totalGroupRounds) {
        // Transition to knockout
        return await startKnockout(tournamentId, metadata);
    } else if (stage === 'knockout') {
        return await continueKnockout(tournamentId, metadata);
    } else {
        return {
            success: false,
            round: '',
            roundNumber: currentRound,
            stage: 'knockout',
            matchesCreated: 0,
            matches: [],
            message: 'Tournament completed or invalid state'
        };
    }
}

// ============================================================================
// GROUP STAGE ROUND
// ============================================================================

async function startGroupRound(
    tournamentId: number,
    metadata: Record<string, any>,
    nextRound: number
): Promise<RoundResult> {

    const teamMap = await getTeamMap(tournamentId);
    const matches: MatchInfo[] = [];
    const now = new Date().toISOString();

    // For each group, generate round-robin pairing for this round
    for (const [groupLetter, teamIds] of Object.entries(metadata.groups as Record<string, number[]>)) {
        const schedule = generateRoundRobinSchedule(teamIds);

        if (nextRound > schedule.length) continue; // Group finished

        const roundData = schedule[nextRound - 1];
        const roundIdentifier = `GS-${groupLetter}-R${nextRound}`;

        // Handle BYE - team sits out this round (NO win awarded)
        if (roundData.byeTeam !== null) {
            const team = teamMap.get(roundData.byeTeam);
            if (team) {
                // Create BYE match - marked as 'bye' status, NO winner
                const { data: matchData } = await supabase
                    .from('matches')
                    .insert({
                        tournament_id: tournamentId,
                        round: roundIdentifier,
                        status: 'bye',  // Special status - not counted in standings
                        winner_team_id: null,  // NO winner for BYE
                        start_time: now
                    })
                    .select('id')
                    .single();

                if (matchData) {
                    const { data: pairing } = await supabase
                        .from('pairings')
                        .insert({ tournament_id: tournamentId, match_id: matchData.id })
                        .select('id')
                        .single();

                    if (pairing) {
                        await supabase.from('pairing_teams').insert({ pairing_id: pairing.id, team_id: roundData.byeTeam });

                        matches.push({
                            match_id: matchData.id,
                            pairing_id: pairing.id,
                            team1: { team_id: roundData.byeTeam, name: team.display_name },
                            team2: null,
                            round: roundIdentifier,
                            status: 'bye'
                        });
                    }
                }
            }
        }

        // Create actual matches
        for (const [tid1, tid2] of roundData.pairs) {
            const team1 = teamMap.get(tid1);
            const team2 = teamMap.get(tid2);
            
            console.log(`Creating match: ${team1?.display_name || tid1} vs ${team2?.display_name || tid2}`);

            const { data: matchData, error: matchError } = await supabase
                .from('matches')
                .insert({
                    tournament_id: tournamentId,
                    round: roundIdentifier,
                    status: 'scheduled',
                    start_time: now
                })
                .select('id')
                .single();

            if (matchError || !matchData) {
                console.log(`Error creating match: ${matchError?.message}`);
                continue;
            }

            const { data: pairing, error: pairingError } = await supabase
                .from('pairings')
                .insert({ tournament_id: tournamentId, match_id: matchData.id })
                .select('id')
                .single();

            if (pairingError || !pairing) {
                console.log(`Error creating pairing for match ${matchData.id}: ${pairingError?.message}`);
                continue;
            }

            const { error: ptError } = await supabase.from('pairing_teams').insert([
                { pairing_id: pairing.id, team_id: tid1 },
                { pairing_id: pairing.id, team_id: tid2 }
            ]);
            
            if (ptError) {
                console.log(`Error creating pairing_teams: ${ptError.message}`);
            } else {
                console.log(`Created pairing ${pairing.id} with teams ${tid1} and ${tid2}`);
            }

            matches.push({
                match_id: matchData.id,
                pairing_id: pairing.id,
                team1: { team_id: tid1, name: team1?.display_name || `Team ${tid1}` },
                team2: { team_id: tid2, name: team2?.display_name || `Team ${tid2}` },
                round: roundIdentifier,
                status: 'scheduled'
            });
        }
    }

    // Update metadata
    await supabase
        .from('tournaments')
        .update({
            metadata: { ...metadata, current_round: nextRound }
        })
        .eq('id', tournamentId);

    return {
        success: true,
        round: `Group Stage Round ${nextRound}`,
        roundNumber: nextRound,
        stage: 'group_stage',
        matchesCreated: matches.length,
        matches,
        message: `Created ${matches.length} matches for Round ${nextRound}`
    };
}

// ============================================================================
// KNOCKOUT STAGE
// ============================================================================

async function startKnockout(
    tournamentId: number,
    metadata: Record<string, any>
): Promise<RoundResult> {

    const teamsToAdvance = metadata.teams_to_advance || 2;
    const teamMap = await getTeamMap(tournamentId);
    const matches: MatchInfo[] = [];
    const now = new Date().toISOString();

    // Get standings per group
    const qualifiedTeams: { team_id: number; group: string; position: number; wins: number }[] = [];

    for (const [groupLetter, teamIds] of Object.entries(metadata.groups as Record<string, number[]>)) {
        // Count wins
        const teamWins = new Map<number, number>();
        teamIds.forEach(tid => teamWins.set(tid, 0));

        const { data: completedMatches } = await supabase
            .from('matches')
            .select('id, winner_team_id')
            .eq('tournament_id', tournamentId)
            .like('round', `GS-${groupLetter}-%`)
            .eq('status', 'completed');

        completedMatches?.forEach(m => {
            if (m.winner_team_id && teamWins.has(m.winner_team_id)) {
                teamWins.set(m.winner_team_id, (teamWins.get(m.winner_team_id) || 0) + 1);
            }
        });

        // Sort by wins DESC
        const sorted = teamIds
            .map(tid => ({ team_id: tid, wins: teamWins.get(tid) || 0 }))
            .sort((a, b) => b.wins - a.wins);

        // Take top N
        for (let i = 0; i < Math.min(teamsToAdvance, sorted.length); i++) {
            qualifiedTeams.push({
                team_id: sorted[i].team_id,
                group: groupLetter,
                position: i + 1,
                wins: sorted[i].wins
            });
        }
    }

    if (qualifiedTeams.length < 2) {
        return {
            success: false, round: '', roundNumber: 0, stage: 'knockout',
            matchesCreated: 0, matches: [],
            message: `Not enough teams qualified (${qualifiedTeams.length})`
        };
    }

    // Determine knockout round name
    const numTeams = qualifiedTeams.length;
    let roundName = 'QF';
    if (numTeams === 2) roundName = 'F';
    else if (numTeams <= 4) roundName = 'SF';
    else if (numTeams <= 8) roundName = 'QF';

    // Cross-seed: A1 vs B2, B1 vs A2, etc.
    const matchups: [number, number][] = [];
    const groups = [...new Set(qualifiedTeams.map(t => t.group))].sort();

    if (groups.length >= 2) {
        // A1 vs B2, B1 vs A2
        const groupA = qualifiedTeams.filter(t => t.group === groups[0]).sort((a, b) => a.position - b.position);
        const groupB = qualifiedTeams.filter(t => t.group === groups[1]).sort((a, b) => a.position - b.position);

        if (groupA[0] && groupB[1]) matchups.push([groupA[0].team_id, groupB[1].team_id]);
        if (groupB[0] && groupA[1]) matchups.push([groupB[0].team_id, groupA[1].team_id]);
    }

    const knockoutPairingIds: number[] = [];

    for (const [tid1, tid2] of matchups) {
        const team1 = teamMap.get(tid1);
        const team2 = teamMap.get(tid2);

        const { data: matchData } = await supabase
            .from('matches')
            .insert({
                tournament_id: tournamentId,
                round: roundName,
                status: 'scheduled',
                start_time: now
            })
            .select('id')
            .single();

        if (!matchData) continue;

        const { data: pairing } = await supabase
            .from('pairings')
            .insert({ tournament_id: tournamentId, match_id: matchData.id })
            .select('id')
            .single();

        if (!pairing) continue;

        await supabase.from('pairing_teams').insert([
            { pairing_id: pairing.id, team_id: tid1 },
            { pairing_id: pairing.id, team_id: tid2 }
        ]);

        knockoutPairingIds.push(pairing.id);

        matches.push({
            match_id: matchData.id,
            pairing_id: pairing.id,
            team1: { team_id: tid1, name: team1?.display_name || `Team ${tid1}` },
            team2: { team_id: tid2, name: team2?.display_name || `Team ${tid2}` },
            round: roundName,
            status: 'scheduled'
        });
    }

    // Update metadata
    await supabase
        .from('tournaments')
        .update({
            metadata: {
                ...metadata,
                stage: 'knockout',
                knockout: { pairing_ids: knockoutPairingIds }
            }
        })
        .eq('id', tournamentId);

    return {
        success: true,
        round: roundName,
        roundNumber: 1,
        stage: 'knockout',
        matchesCreated: matches.length,
        matches,
        message: `Started ${roundName} with ${matches.length} matches`
    };
}

async function continueKnockout(
    tournamentId: number,
    metadata: Record<string, any>
): Promise<RoundResult> {

    const teamMap = await getTeamMap(tournamentId);
    const now = new Date().toISOString();

    // Get last knockout round
    const { data: knockoutMatches } = await supabase
        .from('matches')
        .select('id, round, winner_team_id, status')
        .eq('tournament_id', tournamentId)
        .in('round', ['QF', 'SF', 'F'])
        .order('id', { ascending: false });

    if (!knockoutMatches || knockoutMatches.length === 0) {
        return {
            success: false, round: '', roundNumber: 0, stage: 'knockout',
            matchesCreated: 0, matches: [],
            message: 'No knockout matches found'
        };
    }

    // Check which round to create next
    const hasQF = knockoutMatches.some(m => m.round === 'QF');
    const hasSF = knockoutMatches.some(m => m.round === 'SF');
    const hasF = knockoutMatches.some(m => m.round === 'F');

    let sourceRound = '';
    let nextRound = '';

    if (hasQF && !hasSF) {
        sourceRound = 'QF';
        nextRound = 'SF';
    } else if (hasSF && !hasF) {
        sourceRound = 'SF';
        nextRound = 'F';
    } else if (hasF) {
        // Check if final is complete
        const final = knockoutMatches.find(m => m.round === 'F');
        if (final?.status === 'completed') {
            return {
                success: false, round: 'F', roundNumber: 0, stage: 'knockout',
                matchesCreated: 0, matches: [],
                message: 'Tournament complete! Final has been played.'
            };
        }
        return {
            success: false, round: 'F', roundNumber: 0, stage: 'knockout',
            matchesCreated: 0, matches: [],
            message: 'Final already scheduled. Complete the match first.'
        };
    } else {
        return {
            success: false, round: '', roundNumber: 0, stage: 'knockout',
            matchesCreated: 0, matches: [],
            message: 'Invalid knockout state'
        };
    }

    // Get winners from source round
    const sourceMatches = knockoutMatches.filter(m => m.round === sourceRound);
    const incompleteSource = sourceMatches.filter(m => m.status !== 'completed');

    if (incompleteSource.length > 0) {
        return {
            success: false, round: sourceRound, roundNumber: 0, stage: 'knockout',
            matchesCreated: 0, matches: [],
            message: `Complete ${incompleteSource.length} ${sourceRound} matches first`
        };
    }

    const winnerIds = sourceMatches.map(m => m.winner_team_id).filter(Boolean) as number[];

    if (winnerIds.length < 2) {
        return {
            success: false, round: '', roundNumber: 0, stage: 'knockout',
            matchesCreated: 0, matches: [],
            message: `Not enough winners from ${sourceRound}`
        };
    }

    // Create next round matches
    const matches: MatchInfo[] = [];
    const knockoutPairingIds = metadata.knockout?.pairing_ids || [];

    // For SF: QF1 winner vs QF2 winner, etc.
    // For F: SF1 winner vs SF2 winner
    for (let i = 0; i < winnerIds.length; i += 2) {
        if (i + 1 >= winnerIds.length) break;

        const tid1 = winnerIds[i];
        const tid2 = winnerIds[i + 1];
        const team1 = teamMap.get(tid1);
        const team2 = teamMap.get(tid2);

        const { data: matchData } = await supabase
            .from('matches')
            .insert({
                tournament_id: tournamentId,
                round: nextRound,
                status: 'scheduled',
                start_time: now
            })
            .select('id')
            .single();

        if (!matchData) continue;

        const { data: pairing } = await supabase
            .from('pairings')
            .insert({ tournament_id: tournamentId, match_id: matchData.id })
            .select('id')
            .single();

        if (!pairing) continue;

        await supabase.from('pairing_teams').insert([
            { pairing_id: pairing.id, team_id: tid1 },
            { pairing_id: pairing.id, team_id: tid2 }
        ]);

        knockoutPairingIds.push(pairing.id);

        matches.push({
            match_id: matchData.id,
            pairing_id: pairing.id,
            team1: { team_id: tid1, name: team1?.display_name || `Team ${tid1}` },
            team2: { team_id: tid2, name: team2?.display_name || `Team ${tid2}` },
            round: nextRound,
            status: 'scheduled'
        });
    }

    // Update metadata
    await supabase
        .from('tournaments')
        .update({
            metadata: {
                ...metadata,
                knockout: { pairing_ids: knockoutPairingIds }
            }
        })
        .eq('id', tournamentId);

    return {
        success: true,
        round: nextRound,
        roundNumber: nextRound === 'SF' ? 2 : 3,
        stage: 'knockout',
        matchesCreated: matches.length,
        matches,
        message: `Created ${nextRound} with ${matches.length} matches`
    };
}

// ============================================================================
// SET MATCH WINNER
// ============================================================================

export async function setMatchWinner(
    matchId: number,
    winnerTeamId: number
): Promise<{ success: boolean; message: string }> {

    const { error } = await supabase
        .from('matches')
        .update({
            winner_team_id: winnerTeamId,
            status: 'completed',
            end_time: new Date().toISOString()
        })
        .eq('id', matchId);

    if (error) {
        return { success: false, message: `Error: ${error.message}` };
    }

    return { success: true, message: `Match ${matchId} completed. Winner: Team ${winnerTeamId}` };
}

/**
 * Set all pending matches with Team 1 as winner (for testing)
 */
export async function setAllTeam1Winners(tournamentId: number): Promise<{ success: boolean; count: number; message: string }> {

    // Get all scheduled matches with their teams
    const { data: matches } = await supabase
        .from('matches')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('status', 'scheduled');

    if (!matches || matches.length === 0) {
        return { success: true, count: 0, message: 'No pending matches' };
    }

    let count = 0;

    for (const match of matches) {
        const { data: pairing } = await supabase
            .from('pairings')
            .select('id')
            .eq('match_id', match.id)
            .single();

        if (!pairing) continue;

        const { data: teams } = await supabase
            .from('pairing_teams')
            .select('team_id')
            .eq('pairing_id', pairing.id)
            .order('team_id', { ascending: true });

        if (!teams || teams.length < 2) continue;

        const winnerId = teams[0].team_id; // First team wins

        await supabase
            .from('matches')
            .update({
                winner_team_id: winnerId,
                status: 'completed',
                end_time: new Date().toISOString()
            })
            .eq('id', match.id);

        count++;
    }

    return { success: true, count, message: `Set ${count} matches with Team 1 as winner` };
}

export { generateRoundRobinSchedule };

