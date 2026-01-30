import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tournamentsApi } from "@/lib/api";

export function useTournamentInvites(tournamentId) {
  const queryClient = useQueryClient();

  const invitesQuery = useQuery({
    queryKey: ["tournament-invites", tournamentId],
    queryFn: async () => {
      const response = await tournamentsApi.getInvites(tournamentId);
      return response.data.data.invites;
    },
    enabled: !!tournamentId,
  });

  const inviteMutation = useMutation({
    mutationFn: ({ tournamentId, inviteeId, teamId }) => {
      const payload = { invitee_id: inviteeId };
      if (teamId != null) payload.team_id = teamId;
      return tournamentsApi.invite(tournamentId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament-invites", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const generateLinkMutation = useMutation({
    mutationFn: ({ tournamentId, teamId }) =>
      tournamentsApi.generateInviteLink(tournamentId, teamId != null ? { team_id: teamId } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament-invites", tournamentId] });
    },
  });

  const acceptInviteMutation = useMutation({
    mutationFn: ({ inviteId, status }) =>
      tournamentsApi.updateInvite(inviteId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament-invites", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["tournament-teams", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return {
    invites: invitesQuery.data || [],
    isLoading: invitesQuery.isLoading,
    invite: inviteMutation.mutate,
    generateLink: generateLinkMutation.mutate,
    acceptInvite: acceptInviteMutation.mutate,
    acceptInviteAsync: acceptInviteMutation.mutateAsync,
    isInviting: inviteMutation.isPending,
    isGeneratingLink: generateLinkMutation.isPending,
    isAcceptingInvite: acceptInviteMutation.isPending,
    inviteData: inviteMutation.data,
    linkData: generateLinkMutation.data,
  };
}


