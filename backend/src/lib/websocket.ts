// In-memory store for match scores (simple counter)
const matchScores = new Map<number, { teamA: number; teamB: number }>();
// Store WebSocket connections per match
const matchConnections = new Map<number, Set<any>>();

/**
 * Get or create the score store for a match
 */
export function getMatchScore(matchId: number): { teamA: number; teamB: number } {
  if (!matchScores.has(matchId)) {
    matchScores.set(matchId, { teamA: 0, teamB: 0 });
  }
  return matchScores.get(matchId)!;
}

/**
 * Get or create the connections set for a match
 */
export function getMatchConnections(matchId: number): Set<any> {
  if (!matchConnections.has(matchId)) {
    matchConnections.set(matchId, new Set());
  }
  return matchConnections.get(matchId)!;
}

/**
 * Add a WebSocket connection for a match
 */
export function addConnection(matchId: number, ws: any) {
  const connections = getMatchConnections(matchId);
  connections.add(ws);
  console.log(`🔌 [DEBUG] Connection added for match ${matchId}. Total connections: ${connections.size}`);
}

/**
 * Remove a WebSocket connection for a match
 */
export function removeConnection(matchId: number, ws: any) {
  const connections = matchConnections.get(matchId);
  if (connections) {
    connections.delete(ws);

    // Clean up if no connections left
    if (connections.size === 0) {
      matchConnections.delete(matchId);
    }
  }
}

/**
 * Calculate win rate for Team A based on scores
 * @param teamA - Team A score
 * @param teamB - Team B score
 * @returns Win rate percentage (0-100)
 */
export function calculateWinRate(teamA: number, teamB: number): number {
  const totalScore = teamA + teamB;
  if (totalScore === 0) {
    return 50; // Default to 50% if no points scored
  }
  return Math.round((teamA / totalScore) * 100);
}

/**
 * Broadcast score update to all connected WebSocket clients for a match
 * @param matchId - The match ID
 * @param teamA - Team A score
 * @param teamB - Team B score
 * @param winRate - Win rate percentage (0-100)
 */
export function broadcastMatchScore(matchId: number, teamA: number, teamB: number, winRate: number) {
  console.log(`📡 [Broadcaster] CALLED for match ${matchId} (Type: ${typeof matchId}) with score ${teamA}-${teamB}`);

  // Update the in-memory score
  const currentScore = getMatchScore(matchId);
  currentScore.teamA = teamA;
  currentScore.teamB = teamB;

  // Get connections for this match
  const connections = matchConnections.get(matchId);

  console.log(`🔍 [Broadcaster] Checking connections for match ${matchId} (Type: ${typeof matchId}). Found: ${connections?.size ?? 0}`);

  if (!connections || connections.size === 0) {
    // No connections, just update the score in memory
    console.log(`⚠️ [Broadcaster] No connections for match ${matchId}, skipping broadcast.`);
    return;
  }

  // Broadcast to all connected clients
  const updateMessage = JSON.stringify({
    type: "score_update",
    matchId,
    teamA: currentScore.teamA,
    teamB: currentScore.teamB,
    winRate: winRate,
  });

  connections.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(updateMessage);
      } catch (error) {
        console.error(`❌ Error sending WebSocket message to client for match ${matchId}:`, error);
      }
    }
  });

  console.log(`📡 Broadcasted match ${matchId} score: ${teamA} - ${teamB} to ${connections.size} client(s)`);
}

/**
 * Broadcast match_end event to all connected WebSocket clients for a match
 * @param matchId - The match ID
 * @param winnerTeamId - The winning team ID
 */
export function broadcastMatchEnd(matchId: number, winnerTeamId: number | null) {
  // Get connections for this match
  const connections = matchConnections.get(matchId);

  if (!connections || connections.size === 0) {
    // No connections, nothing to broadcast
    return;
  }

  // Broadcast match_end event to all connected clients
  const endMessage = JSON.stringify({
    type: "match_end",
    matchId,
    winnerTeamId,
  });

  connections.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(endMessage);
      } catch (error) {
        console.error(`❌ Error sending match_end WebSocket message to client for match ${matchId}:`, error);
      }
    }
  });
}

// ============================================================================
// TOURNAMENT-LEVEL WEBSOCKET (for pairings, standings, etc.)
// ============================================================================

// Store WebSocket connections per tournament
const tournamentConnections = new Map<number, Set<any>>();

/**
 * Get or create the connections set for a tournament
 */
export function getTournamentConnections(tournamentId: number): Set<any> {
  if (!tournamentConnections.has(tournamentId)) {
    tournamentConnections.set(tournamentId, new Set());
  }
  return tournamentConnections.get(tournamentId)!;
}

/**
 * Add a WebSocket connection for a tournament
 */
export function addTournamentConnection(tournamentId: number, ws: any) {
  const connections = getTournamentConnections(tournamentId);
  connections.add(ws);
  console.log(`🔌 Added tournament ${tournamentId} WS connection. Total: ${connections.size}`);
}

/**
 * Remove a WebSocket connection for a tournament
 */
export function removeTournamentConnection(tournamentId: number, ws: any) {
  const connections = tournamentConnections.get(tournamentId);
  if (connections) {
    connections.delete(ws);
    console.log(`🔌 Removed tournament ${tournamentId} WS connection. Remaining: ${connections.size}`);

    // Clean up if no connections left
    if (connections.size === 0) {
      tournamentConnections.delete(tournamentId);
    }
  }
}

/**
 * Broadcast tournament update to all connected clients
 */
export function broadcastTournamentUpdate(tournamentId: number, type: string, data: any) {
  const connections = tournamentConnections.get(tournamentId);

  if (!connections || connections.size === 0) {
    console.log(`📡 No tournament ${tournamentId} connections to broadcast to`);
    return;
  }

  const message = JSON.stringify({
    type,
    tournamentId,
    ...data,
  });

  connections.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(message);
      } catch (error) {
        console.error(`❌ Error sending tournament WS message:`, error);
      }
    }
  });

  console.log(`📡 Broadcasted tournament ${tournamentId} ${type} to ${connections.size} client(s)`);
}

/**
 * Broadcast new pairings generated event
 */
export function broadcastPairingsGenerated(tournamentId: number, round: string) {
  broadcastTournamentUpdate(tournamentId, 'pairings_generated', { round });
}

/**
 * Broadcast standings update event
 */
export function broadcastStandingsUpdate(tournamentId: number, standings: any) {
  broadcastTournamentUpdate(tournamentId, 'standings_update', { standings });
}
