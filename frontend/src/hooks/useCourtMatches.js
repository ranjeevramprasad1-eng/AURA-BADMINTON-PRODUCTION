import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { createWebSocketConnection } from '@/lib/websocket';
import { matchesApi } from '@/lib/api';

/**
 * Hook to get matches for a specific court in a tournament
 * @param {string|number} tournamentId - Tournament ID
 * @param {string|number} courtId - Court ID
 * @param {object} options - Additional query options
 * @param {boolean} options.liveUpdates - Enable live updates via websocket (default: false)
 * @returns {object} React Query result with matches data
 */
export function useCourtMatches(tournamentId, courtId, options = {}) {
  const { liveUpdates = false } = options;
  const queryClient = useQueryClient();
  const wsConnectionsRef = useRef({});

  const matchesQuery = useQuery({
    queryKey: ['matches', 'court', tournamentId, courtId],
    queryFn: async () => {
      const response = await matchesApi.getAll({
        tournament_id: tournamentId,
        court_id: courtId,
      });
      return response.data?.data?.matches || [];
    },
    enabled: !!tournamentId && !!courtId,
  });

  // Set up WebSocket connections for live score updates
  useEffect(() => {
    if (!liveUpdates || !matchesQuery.data || matchesQuery.data.length === 0) {
      // Clean up connections if live updates are disabled or no matches
      Object.values(wsConnectionsRef.current).forEach((ws) => {
        if (ws && ws.close) ws.close();
      });
      wsConnectionsRef.current = {};
      return;
    }

    // Create WebSocket connection for each match
    matchesQuery.data.forEach((match) => {
      const matchId = match.id;
      if (!matchId || wsConnectionsRef.current[matchId]) return;

      const ws = createWebSocketConnection(`/ws/match/${matchId}/score`, {
        onOpen: (event, wsInstance) => {
          console.log(`🔌 WebSocket connected for match ${matchId}`);
          // Send initial score data if available
          if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
            const matchDetails = queryClient.getQueryData(['match', 'details', matchId]);
            if (matchDetails?.scores && matchDetails.scores.length > 0) {
              const latestScore = matchDetails.scores[matchDetails.scores.length - 1];
              wsInstance.send(
                JSON.stringify({
                  type: 'init',
                  teamA: latestScore.team_a_score || 0,
                  teamB: latestScore.team_b_score || 0,
                })
              );
            }
          }
        },
        onClose: () => {
          console.log(`🔌 WebSocket disconnected for match ${matchId}`);
        },
        onError: (error) => {
          console.error(`❌ WebSocket error for match ${matchId}:`, error);
        },
        onMessage: (data) => {
          if (data.type === 'score_update') {
            // Update match details cache with new scores
            queryClient.setQueryData(['match', 'details', matchId], (oldData) => {
              if (!oldData) return oldData;
              
              const newScore = {
                id: Date.now(), // Temporary ID
                match_id: matchId,
                team_a_score: data.teamA,
                team_b_score: data.teamB,
                serving_team_id: data.serving_team_id || oldData.serving_team_id,
                server_sequence: data.server_sequence || oldData.server_sequence,
                created_at: new Date().toISOString(),
              };

              return {
                ...oldData,
                scores: [...(oldData.scores || []), newScore],
              };
            });
          } else if (data.type === 'match_end') {
            // Update match status in matches list
            queryClient.setQueryData(['matches', 'court', tournamentId, courtId], (oldData) => {
              if (!oldData) return oldData;
              return oldData.map((m) =>
                m.id === matchId
                  ? { ...m, status: 'completed', winner_team_id: data.winnerTeamId }
                  : m
              );
            });

            // Update match details
            queryClient.setQueryData(['match', 'details', matchId], (oldData) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                status: 'completed',
                winner_team_id: data.winnerTeamId,
              };
            });
          }
        },
        reconnect: true,
      });

      wsConnectionsRef.current[matchId] = ws;
    });

    // Cleanup: remove connections for matches that no longer exist
    Object.keys(wsConnectionsRef.current).forEach((matchId) => {
      const matchExists = matchesQuery.data.some((m) => m.id === parseInt(matchId));
      if (!matchExists) {
        wsConnectionsRef.current[matchId]?.close();
        delete wsConnectionsRef.current[matchId];
      }
    });

    return () => {
      Object.values(wsConnectionsRef.current).forEach((ws) => {
        if (ws && ws.close) ws.close();
      });
      wsConnectionsRef.current = {};
    };
  }, [liveUpdates, matchesQuery.data, tournamentId, courtId, queryClient]);

  return matchesQuery;
}

/**
 * Hook to get the active match for a specific court
 * Returns the in_progress match or the most recent match
 * @param {string|number} tournamentId - Tournament ID
 * @param {string|number} courtId - Court ID
 * @param {object} options - Additional query options
 * @param {boolean} options.liveUpdates - Enable live updates via websocket (default: false)
 * @returns {object} React Query result with active match data
 */
export function useActiveCourtMatch(tournamentId, courtId, options = {}) {
  const { liveUpdates = false } = options;
  
  const matchesQuery = useCourtMatches(tournamentId, courtId, { liveUpdates });
  
  // Get the active match (in_progress or most recent)
  const activeMatch = matchesQuery.data?.find(
    (m) => m.status === 'in_progress'
  ) || matchesQuery.data?.[0];

  // Fetch detailed match data if we have an active match
  const matchDetailsQuery = useQuery({
    queryKey: ['match', 'details', activeMatch?.id],
    queryFn: async () => {
      if (!activeMatch?.id) return null;
      const response = await matchesApi.getById(activeMatch.id);
      return response.data?.data;
    },
    enabled: !!activeMatch?.id,
  });

  return {
    ...matchesQuery,
    activeMatch,
    matchDetails: matchDetailsQuery.data,
    isLoadingMatchDetails: matchDetailsQuery.isLoading,
    matchDetailsError: matchDetailsQuery.error,
  };
}
