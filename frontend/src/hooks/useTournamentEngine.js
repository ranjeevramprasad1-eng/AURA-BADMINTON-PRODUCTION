'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tournamentEngineApi } from '@/lib/api';

/**
 * Hook for tournament engine operations (Group + Knockout format)
 * 
 * @param {number|string} tournamentId - Tournament ID
 */
export function useTournamentEngine(tournamentId) {
  const queryClient = useQueryClient();

  // Query keys
  const keys = {
    info: ['tournament-engine', 'info', tournamentId],
    standings: ['tournament-engine', 'standings', tournamentId],
    teams: ['tournament-engine', 'teams', tournamentId],
    matches: ['tournament-engine', 'matches', tournamentId],
    nextAction: ['tournament-engine', 'next-action', tournamentId],
  };

  // Get tournament engine info
  const infoQuery = useQuery({
    queryKey: keys.info,
    queryFn: async () => {
      const response = await tournamentEngineApi.getInfo(tournamentId);
      return response.data.data;
    },
    enabled: !!tournamentId,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Get group standings
  const standingsQuery = useQuery({
    queryKey: keys.standings,
    queryFn: async () => {
      const response = await tournamentEngineApi.getStandings(tournamentId);
      return response.data.data.standings;
    },
    enabled: !!tournamentId && infoQuery.data?.groups !== null,
    staleTime: 30 * 1000,
  });

  // Get registered teams with group assignments
  const teamsQuery = useQuery({
    queryKey: keys.teams,
    queryFn: async () => {
      const response = await tournamentEngineApi.getTeams(tournamentId);
      return response.data.data;
    },
    enabled: !!tournamentId,
    staleTime: 60 * 1000, // 1 minute
  });

  // Get all matches
  const matchesQuery = useQuery({
    queryKey: keys.matches,
    queryFn: async () => {
      const response = await tournamentEngineApi.getMatches(tournamentId);
      return response.data.data.matches;
    },
    enabled: !!tournamentId,
    staleTime: 30 * 1000,
  });

  // Get next action
  const nextActionQuery = useQuery({
    queryKey: keys.nextAction,
    queryFn: async () => {
      const response = await tournamentEngineApi.getNextAction(tournamentId);
      return response.data.data;
    },
    enabled: !!tournamentId,
    staleTime: 30 * 1000,
  });

  // Invalidate all engine queries
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['tournament-engine'] });
  };

  // Initialize groups mutation
  const initializeGroupsMutation = useMutation({
    mutationFn: (numberOfGroups) =>
      tournamentEngineApi.initializeGroups(tournamentId, numberOfGroups),
    onSuccess: () => {
      invalidateAll();
    },
  });

  // Start next round mutation
  const startNextRoundMutation = useMutation({
    mutationFn: () => tournamentEngineApi.startNextRound(tournamentId),
    onSuccess: () => {
      invalidateAll();
    },
  });

  // Swap team mutation
  const swapTeamMutation = useMutation({
    mutationFn: ({ teamId, fromGroup, toGroup }) =>
      tournamentEngineApi.swapTeam(tournamentId, teamId, fromGroup, toGroup),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.teams });
      queryClient.invalidateQueries({ queryKey: keys.info });
    },
  });

  // Reset tournament mutation
  const resetMutation = useMutation({
    mutationFn: () => tournamentEngineApi.reset(tournamentId),
    onSuccess: () => {
      invalidateAll();
    },
  });

  // Set all winners mutation (for testing)
  const setAllWinnersMutation = useMutation({
    mutationFn: () => tournamentEngineApi.setAllWinners(tournamentId),
    onSuccess: () => {
      invalidateAll();
    },
  });

  // Set match winner mutation
  const setMatchWinnerMutation = useMutation({
    mutationFn: ({ matchId, winnerTeamId }) =>
      tournamentEngineApi.setMatchWinner(matchId, winnerTeamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.matches });
      queryClient.invalidateQueries({ queryKey: keys.standings });
      queryClient.invalidateQueries({ queryKey: keys.nextAction });
    },
  });

  return {
    // Data
    info: infoQuery.data,
    standings: standingsQuery.data,
    teams: teamsQuery.data,
    matches: matchesQuery.data,
    nextAction: nextActionQuery.data,

    // Loading states
    isLoading: infoQuery.isLoading,
    isLoadingStandings: standingsQuery.isLoading,
    isLoadingTeams: teamsQuery.isLoading,
    isLoadingMatches: matchesQuery.isLoading,

    // Error states
    error: infoQuery.error,

    // Refetch
    refetch: infoQuery.refetch,
    refetchStandings: standingsQuery.refetch,
    refetchMatches: matchesQuery.refetch,
    refetchAll: invalidateAll,

    // Mutations
    initializeGroups: initializeGroupsMutation.mutate,
    isInitializing: initializeGroupsMutation.isPending,
    initializeError: initializeGroupsMutation.error,

    startNextRound: startNextRoundMutation.mutate,
    isStartingRound: startNextRoundMutation.isPending,
    startRoundError: startNextRoundMutation.error,

    swapTeam: swapTeamMutation.mutate,
    isSwapping: swapTeamMutation.isPending,
    swapError: swapTeamMutation.error,

    reset: resetMutation.mutate,
    isResetting: resetMutation.isPending,
    resetError: resetMutation.error,

    setAllWinners: setAllWinnersMutation.mutate,
    isSettingAllWinners: setAllWinnersMutation.isPending,

    setMatchWinner: setMatchWinnerMutation.mutate,
    isSettingWinner: setMatchWinnerMutation.isPending,
    setWinnerError: setMatchWinnerMutation.error,

    // Computed helpers
    isGroupKnockout: infoQuery.data?.format === 'group_knockout',
    isSwiss: infoQuery.data?.format === 'swiss' || !infoQuery.data?.format || infoQuery.data?.format === 'unknown',
    stage: infoQuery.data?.stage,
    canProceed: nextActionQuery.data?.canProceed,
  };
}

export default useTournamentEngine;

