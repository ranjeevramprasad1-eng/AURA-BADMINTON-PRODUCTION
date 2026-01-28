"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  tournamentsApi,
  playersApi,
  pairingsApi,
  matchesApi,
  courtsApi,
} from "@/lib/api";
import { useUser } from "@/hooks/useUser";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  UserPlus,
  X,
  Search,
  Users,
  Play,
  Clock,
  Trophy,
  ShieldAlert,
  LayoutGrid,
  Eye,
  Trash2,
} from "lucide-react";
import {
  ScrollablePage,
  ScrollablePageHeader,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";
import { toast } from "sonner";
import { GroupManager } from "@/components/tournaments/GroupManager";
import { useTournamentEngine } from "@/hooks/useTournamentEngine";
import { TournamentManageNav } from "@/components/navigation/TournamentManageNav";

export default function TournamentManagePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const [isGroupManagerDialogOpen, setIsGroupManagerDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data: tournament, isLoading } = useQuery({
    queryKey: ["tournament", params.id],
    queryFn: async () => {
      const response = await tournamentsApi.getById(params.id);
      return response.data.data;
    },
  });

  const { data: userData, isLoading: isLoadingUser } = useUser();

  // Tournament engine hook for group+knockout format
  const {
    info: engineInfo,
    matches: engineMatches,
    isGroupKnockout,
    startNextRound: startEngineRound,
    isStartingRound: isStartingEngineRound,
  } = useTournamentEngine(params.id);

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["player-search", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return { players: [] };
      const response = await playersApi.search(searchQuery);
      return response.data.data;
    },
    enabled: searchQuery.length >= 2 && isSearchDialogOpen,
  });

  const addRefereeMutation = useMutation({
    mutationFn: (playerId) => tournamentsApi.addReferee(params.id, playerId),
    onSuccess: () => {
      toast.success("Referee added successfully!");
      setIsSearchDialogOpen(false);
      setSearchQuery("");
      queryClient.invalidateQueries({ queryKey: ["tournament", params.id] });
    },
    onError: (error) => {
      const errorMessage =
        error?.response?.data?.message || "Failed to add referee";
      toast.error(errorMessage);
    },
  });

  const removeRefereeMutation = useMutation({
    mutationFn: (playerId) => tournamentsApi.removeReferee(params.id, playerId),
    onSuccess: () => {
      toast.success("Referee removed successfully!");
      queryClient.invalidateQueries({ queryKey: ["tournament", params.id] });
    },
    onError: (error) => {
      const errorMessage =
        error?.response?.data?.message || "Failed to remove referee";
      toast.error(errorMessage);
    },
  });

  const deleteTournamentMutation = useMutation({
    mutationFn: () => tournamentsApi.delete(params.id),
    onSuccess: () => {
      toast.success("Tournament deleted successfully!");
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      router.push("/");
    },
    onError: (error) => {
      const errorMessage =
        error?.response?.data?.message || "Failed to delete tournament";
      toast.error(errorMessage);
    },
  });

  const { data: roundStatus, isLoading: isLoadingRoundStatus } = useQuery({
    queryKey: ["tournament-round-status", params.id],
    queryFn: async () => {
      const response = await tournamentsApi.getRoundStatus(params.id);
      return response.data.data;
    },
  });

  const generateRoundMutation = useMutation({
    mutationFn: () => pairingsApi.generateRound(parseInt(params.id)),
    onSuccess: () => {
      toast.success("Round started successfully!");
      queryClient.invalidateQueries({
        queryKey: ["tournament-round-status", params.id],
      });
      queryClient.invalidateQueries({ queryKey: ["tournament", params.id] });
      queryClient.invalidateQueries({
        queryKey: ["current-round-matches", params.id],
      });
    },
    onError: (error) => {
      const errorMessage =
        error?.response?.data?.message || "Failed to start round";
      toast.error(errorMessage);
    },
  });

  const { data: currentRoundMatches, isLoading: isLoadingMatches } = useQuery({
    queryKey: ["current-round-matches", params.id],
    queryFn: async () => {
      const response = await tournamentsApi.getCurrentRoundMatches(params.id);
      return response.data.data;
    },
    enabled: !!roundStatus?.currentRound,
  });

  const assignRefereeMutation = useMutation({
    mutationFn: ({ matchId, refereeId }) =>
      matchesApi.update(matchId, { referee_id: refereeId || null }),
    onSuccess: () => {
      toast.success("Referee assigned successfully!");
      queryClient.invalidateQueries({
        queryKey: ["current-round-matches", params.id],
      });
      // Also refresh engine matches
      queryClient.invalidateQueries({
        queryKey: ["tournament-engine", "matches", params.id],
      });
    },
    onError: (error) => {
      const errorMessage =
        error?.response?.data?.message || "Failed to assign referee";
      toast.error(errorMessage);
    },
  });

  // Fetch courts (filter by tournament venue if available)
  const { data: courtsData, isLoading: isLoadingCourts } = useQuery({
    queryKey: ["courts", tournament?.venue?.id],
    queryFn: async () => {
      const response = await courtsApi.getAll(tournament?.venue?.id || null);
      return response.data.data;
    },
    enabled: !!tournament,
  });

  const assignCourtMutation = useMutation({
    mutationFn: ({ matchId, courtId }) =>
      matchesApi.update(matchId, { court_id: courtId || null }),
    onSuccess: () => {
      toast.success("Court assigned successfully!");
      queryClient.invalidateQueries({
        queryKey: ["current-round-matches", params.id],
      });
      // Also refresh engine matches
      queryClient.invalidateQueries({
        queryKey: ["tournament-engine", "matches", params.id],
      });
    },
    onError: (error) => {
      const errorMessage =
        error?.response?.data?.message || "Failed to assign court";
      toast.error(errorMessage);
    },
  });

  // Parse tournament metadata (safe to do even if tournament is null)
  const tournamentMetadata = useMemo(() => {
    if (!tournament?.metadata) return {};
    if (typeof tournament.metadata === 'string') {
      try {
        return JSON.parse(tournament.metadata);
      } catch (e) {
        return {};
      }
    }
    return tournament.metadata;
  }, [tournament?.metadata]);

  const tournamentFormat = tournamentMetadata?.format || 'swiss';
  const isGroupKnockoutFormat = tournamentFormat === 'group_knockout' || isGroupKnockout;

  // Compute next round button data (must be before conditional returns)
  const nextRoundButtonData = useMemo(() => {
    // For Swiss format
    if (!isGroupKnockoutFormat && roundStatus?.isCurrentRoundComplete && roundStatus?.canStartNextRound) {
      const nextRoundLabel = roundStatus?.nextRound
        ? (/^\d+$/.test(roundStatus?.nextRound)
          ? `Round ${roundStatus.nextRound}`
          : roundStatus.nextRound)
        : null;

      return {
        show: true,
        format: 'swiss',
        currentRound: roundStatus?.currentRound,
        nextRound: nextRoundLabel,
        description: nextRoundLabel
          ? `Ready to start ${/^\d+$/.test(roundStatus?.nextRound) ? `Round ${roundStatus.nextRound}` : roundStatus.nextRound}`
          : "Ready to start next round",
        buttonText: nextRoundLabel || "Start Next Round",
      };
    }

    // For Group+Knockout format
    if (isGroupKnockoutFormat && engineInfo?.current_round > 0 && engineMatches) {
      const currentRoundMatches = engineMatches.filter(m =>
        m.round?.includes(`R${engineInfo.current_round}`) && m.status !== 'bye'
      ) || [];
      const allMatchesComplete = currentRoundMatches.length > 0 &&
        currentRoundMatches.every(m => m.status === 'completed');

      const isTournamentComplete = engineInfo.stage === 'complete';
      const hasNextRound = !isTournamentComplete;

      if (allMatchesComplete && hasNextRound) {
        let nextRoundLabel;
        if (engineInfo.stage === 'group_stage' &&
          engineInfo.current_round < (engineInfo.total_group_rounds || 0)) {
          nextRoundLabel = `Round ${engineInfo.current_round + 1}`;
        } else if (engineInfo.stage === 'group_stage' &&
          engineInfo.current_round >= (engineInfo.total_group_rounds || 0)) {
          nextRoundLabel = "Knockout Stage";
        } else {
          nextRoundLabel = "Next Round";
        }

        return {
          show: true,
          format: 'group_knockout',
          currentRound: engineInfo.current_round,
          nextRound: nextRoundLabel,
          description: `Ready to start ${nextRoundLabel}`,
          buttonText: `Start ${nextRoundLabel}`,
        };
      }
    }

    return { show: false };
  }, [
    isGroupKnockoutFormat,
    roundStatus?.isCurrentRoundComplete,
    roundStatus?.canStartNextRound,
    roundStatus?.currentRound,
    roundStatus?.nextRound,
    engineInfo?.current_round,
    engineInfo?.stage,
    engineInfo?.total_group_rounds,
    engineMatches,
  ]);

  if (isLoading || isLoadingUser) {
    return (
      <ScrollablePage className="bg-background">
        <ScrollablePageHeader className="pb-0 bg-transparent">
          <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
            <div className="flex items-center justify-between px-4 py-3">
              <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
                <ArrowLeft className="size-5" />
              </Button>
              <h1 className="text-lg font-black uppercase tracking-tight">Manage</h1>
              <div className="size-10" />
            </div>
          </header>
        </ScrollablePageHeader>
        <ScrollablePageContent>
          <div className="px-4 pt-6 space-y-4">
            <div className="h-24 w-full bg-muted/50 rounded-xl animate-pulse" />
            <div className="h-40 w-full bg-muted/50 rounded-xl animate-pulse" />
            <div className="h-32 w-full bg-muted/50 rounded-xl animate-pulse" />
          </div>
        </ScrollablePageContent>
      </ScrollablePage>
    );
  }

  if (!tournament) {
    return (
      <ScrollablePage className="bg-background">
        <ScrollablePageHeader className="pb-0 bg-transparent">
          <header className="z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
            <div className="grid grid-cols-3 items-center justify-between px-4 py-3">
              <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
                <ArrowLeft className="size-5" />
              </Button>
              <h1 className="text-lg font-black uppercase tracking-tight">Manage</h1>
              <div className="size-10" />
            </div>
          </header>
        </ScrollablePageHeader>
        <ScrollablePageContent>
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 px-4">
            <div className="bg-muted/30 p-4 rounded-full">
              <Trophy className="size-8 text-muted-foreground/50" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Tournament Not Found</h3>
              <p className="text-muted-foreground text-sm">This tournament doesn't exist or has been removed.</p>
            </div>
            <Button onClick={() => router.back()} variant="outline">Go Back</Button>
          </div>
        </ScrollablePageContent>
      </ScrollablePage>
    );
  }

  // Check if user is the host - restrict access if not
  const tournamentId = parseInt(params.id);
  const isHost = userData?.host_for_tournaments?.some(
    (id) => id === tournamentId || id === params.id
  ) || false;

  if (!isHost) {
    return (
      <ScrollablePage className="bg-background">
        <ScrollablePageHeader className="pb-0 bg-transparent">
          <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
            <div className="flex items-center justify-between px-4 py-3">
              <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
                <ArrowLeft className="size-5" />
              </Button>
              <h1 className="text-lg font-black uppercase tracking-tight">Manage</h1>
              <div className="size-10" />
            </div>
          </header>
        </ScrollablePageHeader>
        <ScrollablePageContent>
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
            <Card className="p-8 max-w-md w-full text-center border-border/50 bg-background/80 backdrop-blur-sm rounded-2xl shadow-lg">
              <div className="flex flex-col items-center gap-4">
                <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <ShieldAlert className="size-8 text-destructive" />
                </div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight mb-2">Access Restricted</h2>
                  <p className="text-muted-foreground text-sm">
                    Only the tournament host can access this page. You don't have permission to manage this tournament.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => router.back()}
                  className="mt-4 rounded-xl"
                >
                  Go Back
                </Button>
              </div>
            </Card>
          </div>
        </ScrollablePageContent>
      </ScrollablePage>
    );
  }

  const referees = tournament.referee || [];
  const courts = courtsData?.courts || [];

  // Helper function to get court_id from court_number or court_id
  const getCourtId = (match) => {
    // If match has court_id directly, use it
    if (match.court_id) return match.court_id;
    // If match has court (court_number), find the matching court_id
    if (match.court && courts.length > 0) {
      const court = courts.find(c => c.court_number === match.court);
      return court?.id || null;
    }
    return null;
  };

  return (
    <ScrollablePage className="bg-background">
      {/* <TournamentManageNav /> */}
      <ScrollablePageHeader className="pb-0 bg-transparent">
        <header className="z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
          <div className="grid grid-cols-3 items-center justify-between px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
              <ArrowLeft className="size-5" />
            </Button>
            <h1 className="text-lg font-black uppercase tracking-tight text-center">Manage</h1>
            <div className="size-10" />
          </div>
        </header>
      </ScrollablePageHeader>

      <ScrollablePageContent className="space-y-6">

        {/* Next Round Button - Show when current round is complete */}
        {nextRoundButtonData.show && (
          <div className="px-4 pt-4">
            <Card className="p-4 border-primary/30 bg-primary/5 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Play className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-black text-sm uppercase tracking-tight">
                      {nextRoundButtonData.format === 'swiss'
                        ? "Round Complete"
                        : `Round ${nextRoundButtonData.currentRound} Complete`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {nextRoundButtonData.description}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    if (nextRoundButtonData.format === 'swiss') {
                      generateRoundMutation.mutate();
                    } else {
                      startEngineRound();
                    }
                  }}
                  disabled={
                    nextRoundButtonData.format === 'swiss'
                      ? generateRoundMutation.isPending
                      : isStartingEngineRound
                  }
                  className="gap-2 font-bold rounded-xl px-6"
                >
                  <Play className="size-4" />
                  {nextRoundButtonData.format === 'swiss'
                    ? (generateRoundMutation.isPending ? "Starting..." : nextRoundButtonData.buttonText)
                    : (isStartingEngineRound ? "Starting..." : nextRoundButtonData.buttonText)}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Tournament Info */}
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-black italic tracking-tight uppercase">{tournament.name}</h2>
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2 font-bold rounded-xl"
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent className="border-border/50">
                <DialogHeader>
                  <DialogTitle className="font-black uppercase tracking-tight">Delete Tournament</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete this tournament? This action cannot be undone. All matches, scores, ratings, registrations, and related data will be permanently deleted.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsDeleteDialogOpen(false)}
                    disabled={deleteTournamentMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => deleteTournamentMutation.mutate()}
                    disabled={deleteTournamentMutation.isPending}
                    className="gap-2"
                  >
                    <Trash2 className="size-4" />
                    {deleteTournamentMutation.isPending ? "Deleting..." : "Delete Tournament"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider border-border/50">
              {isGroupKnockoutFormat ? 'Group + Knockout' : 'Swiss'}
            </Badge>
          </div>
          {tournament.description && (
            <p className="text-muted-foreground text-sm leading-relaxed">
              {tournament.description}
            </p>
          )}
        </div>

        {/* Group+Knockout - Prompt to Start Round */}
        {isGroupKnockoutFormat && engineInfo?.groups && engineInfo?.current_round === 0 && (
          <div className="px-4">
            <Card className="p-6 border-dashed border-2 border-border/50 bg-muted/5 rounded-2xl">
              <div className="text-center py-4">
                <div className="bg-primary/10 p-4 rounded-2xl w-fit mx-auto mb-4">
                  <Trophy className="size-8 text-primary" />
                </div>
                <p className="text-base font-black uppercase tracking-tight mb-1">Groups are ready!</p>
                <p className="text-sm text-muted-foreground mb-5">
                  Start the first round to create matches and assign referees
                </p>
                <Button
                  onClick={() => startEngineRound()}
                  disabled={isStartingEngineRound}
                  className="gap-2 font-bold rounded-xl px-6"
                >
                  <Play className="size-4" />
                  {isStartingEngineRound ? "Starting..." : "Start First Round"}
                </Button>
              </div>
            </Card>
          </div>
        )}


        {/* Group Manager Section (for Group+Knockout format) - Show directly in Card if round hasn't started */}
        {isGroupKnockoutFormat && (!engineInfo || engineInfo?.current_round === 0) && (
          <div className="px-4">
            <Card className="p-5 border-border/50 bg-background/80 backdrop-blur-sm rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <LayoutGrid className="size-4 text-primary" />
                </div>
                <h3 className="font-black text-sm uppercase tracking-wider text-foreground">Group Management</h3>
              </div>
              <GroupManager tournamentId={params.id} />
            </Card>
          </div>
        )}

        {/* Tournament Status Section (for Group+Knockout format) */}
        {isGroupKnockoutFormat && engineInfo && (
          <div className="px-4">
            <Card className="p-5 gap-0 border-border/50 bg-background/80 backdrop-blur-sm rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-sm uppercase tracking-wider text-foreground flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Trophy className="size-4 text-primary" />
                  </div>
                  Tournament Progress
                </h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Stage</span>
                  <Badge
                    variant="outline"
                    className={`font-bold text-[10px] uppercase tracking-wider rounded-lg ${engineInfo.stage === 'knockout'
                      ? 'bg-purple-500/10 text-purple-600 border-purple-200'
                      : engineInfo.stage === 'group_stage'
                        ? 'bg-blue-500/10 text-blue-600 border-blue-200'
                        : engineInfo.stage === 'complete'
                          ? 'bg-green-500/10 text-green-600 border-green-200'
                          : 'border-border/50'
                      }`}
                  >
                    {engineInfo.stage?.replace('_', ' ') || 'Registration'}
                  </Badge>
                </div>
                <Separator className="bg-border/30" />
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Current Round</span>
                  <Badge variant="outline" className="font-bold text-[10px] uppercase tracking-wider border-border/50 rounded-lg">
                    {engineInfo.current_round > 0
                      ? `Round ${engineInfo.current_round}`
                      : 'Not Started'}
                  </Badge>
                </div>
                {engineInfo.groups && (
                  <>
                    <Separator className="bg-border/30" />
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-muted-foreground">Groups</span>
                      <Badge variant="outline" className="font-bold text-[10px] uppercase tracking-wider border-border/50 rounded-lg">
                        {Object.keys(engineInfo.groups).length} Groups
                      </Badge>
                    </div>
                  </>
                )}
                {engineInfo.total_group_rounds && (
                  <>
                    <Separator className="bg-border/30" />
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-muted-foreground">Group Stage Progress</span>
                      <Badge variant="outline" className="font-bold text-[10px] uppercase tracking-wider border-border/50 rounded-lg">
                        {Math.min(engineInfo.current_round, engineInfo.total_group_rounds)} / {engineInfo.total_group_rounds} Rounds
                      </Badge>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Round Status Section (for Swiss format only) */}
        {!isGroupKnockoutFormat && (
          <div className="px-4">
            <Card className="p-5 gap-0 border-border/50 bg-background/80 backdrop-blur-sm rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-sm uppercase tracking-wider text-foreground flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Clock className="size-4 text-primary" />
                  </div>
                  Round Status
                </h3>
                {roundStatus?.canStartNextRound && (
                  <Button
                    onClick={() => generateRoundMutation.mutate()}
                    disabled={generateRoundMutation.isPending}
                    size="sm"
                    className="gap-2 font-bold rounded-xl"
                  >
                    <Play className="size-4" />
                    {generateRoundMutation.isPending
                      ? "Starting..."
                      : roundStatus?.currentRound === null
                        ? "Start First Round"
                        : roundStatus?.nextRound
                          ? (/^\d+$/.test(roundStatus?.nextRound)
                            ? `Start Round ${roundStatus?.nextRound}`
                            : `Start ${roundStatus?.nextRound}`)
                          : "Start Next Round"}
                  </Button>
                )}
              </div>
              {isLoadingRoundStatus ? (
                <p className="text-muted-foreground text-sm">Loading round status...</p>
              ) : (
                <div className="space-y-3">
                  {roundStatus?.currentRound === null ? (
                    <div className="text-center py-4">
                      <p className="text-muted-foreground text-sm">
                        No rounds have started yet. Click the button above to start
                        the first round.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-muted-foreground">Current Round</span>
                        <Badge variant="outline" className="font-bold text-[10px] uppercase tracking-wider border-border/50 rounded-lg">
                          {/^\d+$/.test(roundStatus?.currentRound)
                            ? `Round ${roundStatus?.currentRound}`
                            : roundStatus?.currentRound || "N/A"}
                        </Badge>
                      </div>
                      <Separator className="bg-border/30" />
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-muted-foreground">Status</span>
                        <Badge
                          variant="outline"
                          className={`font-bold text-[10px] uppercase tracking-wider rounded-lg ${roundStatus?.isCurrentRoundComplete
                            ? "bg-green-500/10 text-green-600 border-green-200"
                            : "bg-orange-500/10 text-orange-600 border-orange-200"
                            }`}
                        >
                          {roundStatus?.isCurrentRoundComplete
                            ? "Complete"
                            : "In Progress"}
                        </Badge>
                      </div>
                      {roundStatus?.isCurrentRoundComplete && roundStatus?.nextRound && (
                        <>
                          <Separator className="bg-border/30" />
                          <div className="flex items-center justify-between py-2">
                            <span className="text-sm text-muted-foreground">Next Round</span>
                            <Badge variant="outline" className="font-bold text-[10px] uppercase tracking-wider border-border/50 rounded-lg">
                              {/^\d+$/.test(roundStatus?.nextRound)
                                ? `Round ${roundStatus?.nextRound}`
                                : roundStatus?.nextRound}
                            </Badge>
                          </div>
                        </>
                      )}
                      {roundStatus?.isCurrentRoundComplete && !roundStatus?.nextRound && (
                        <>
                          <Separator className="bg-border/30" />
                          <div className="flex items-center justify-between py-2">
                            <span className="text-sm text-muted-foreground">Tournament Status</span>
                            <Badge variant="outline" className="font-bold text-[10px] uppercase tracking-wider bg-green-500/10 text-green-600 border-green-200 rounded-lg">
                              Complete
                            </Badge>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Group+Knockout Matches Section */}
        {isGroupKnockoutFormat && engineInfo?.current_round > 0 && (() => {
          // Filter matches for current round only (e.g., R1 matches have -R1 suffix)
          // Also filter out BYE matches (only show actual playable matches)
          const currentRoundMatches = engineMatches?.filter(m =>
            m.round?.includes(`R${engineInfo.current_round}`) && m.status !== 'bye'
          ) || [];

          return (
            <div className="px-4">
              <Card className="p-5 border-border/50 bg-background/80 backdrop-blur-sm rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-sm uppercase tracking-wider text-foreground flex items-center gap-2">
                    <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Trophy className="size-4 text-primary" />
                    </div>
                    Round {engineInfo.current_round} Matches
                  </h3>
                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider border-border/50 rounded-lg">
                    {currentRoundMatches.filter(m => m.status === 'completed').length} / {currentRoundMatches.length} done
                  </Badge>
                </div>

                {currentRoundMatches.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="bg-muted/30 p-4 rounded-2xl w-fit mx-auto mb-3">
                      <Trophy className="size-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-muted-foreground text-sm font-medium">No matches for this round</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currentRoundMatches.map((match) => {
                      const team1Name = match.team1?.name || match.team1?.display_name || 'TBD';
                      const team2Name = match.team2?.name || match.team2?.display_name || 'TBD';

                      return (
                        <div key={match.match_id} className="p-4 bg-muted/30 rounded-xl border border-border/30 hover:bg-muted/40 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                {match.round?.replace('GS-', 'Group ').replace('-R', ' Round ')}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className={`text-sm font-semibold ${match.winner_team_id === match.team1?.team_id ? 'font-bold text-green-600' : ''}`}>
                                  {team1Name}
                                </span>
                                <span className="text-xs text-muted-foreground/50 font-black">vs</span>
                                <span className={`text-sm font-semibold ${match.winner_team_id === match.team2?.team_id ? 'font-bold text-green-600' : ''}`}>
                                  {team2Name}
                                </span>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold uppercase tracking-wider rounded-lg ${match.status === 'completed'
                                ? 'bg-green-500/10 text-green-600 border-green-200'
                                : match.status === 'in_progress'
                                  ? 'bg-orange-500/10 text-orange-600 border-orange-200'
                                  : 'border-border/50'
                                }`}
                            >
                              {match.status?.replace('_', ' ') || 'scheduled'}
                            </Badge>
                          </div>

                          {/* Court and Referee Assignment */}
                          <div className="space-y-2 mt-3 pt-3 border-t border-border/20">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground font-bold w-16">Court:</span>
                              <select
                                className="flex-1 px-3 py-2 text-xs border border-border/50 rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={getCourtId(match) || ""}
                                onChange={(e) => {
                                  const courtId = e.target.value ? parseInt(e.target.value) : null;
                                  assignCourtMutation.mutate({
                                    matchId: match.match_id,
                                    courtId,
                                  });
                                }}
                                disabled={assignCourtMutation.isPending || isLoadingCourts}
                              >
                                <option value="">Not Assigned</option>
                                {courts.map((court) => (
                                  <option key={court.id} value={court.id}>
                                    Court {court.court_number}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground font-bold w-16">Referee:</span>
                              <select
                                className="flex-1 px-3 py-2 text-xs border border-border/50 rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={match.referee_id || ""}
                                onChange={(e) => {
                                  const refereeId = e.target.value ? parseInt(e.target.value) : null;
                                  assignRefereeMutation.mutate({
                                    matchId: match.match_id,
                                    refereeId,
                                  });
                                }}
                                disabled={assignRefereeMutation.isPending}
                              >
                                <option value="">Not Assigned</option>
                                {referees.map((referee) => (
                                  <option key={referee.player_id} value={referee.player_id}>
                                    {referee.name || `Referee ${referee.player_id}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center justify-end gap-2 mt-2">
                              {match.status === 'scheduled' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs gap-1.5 font-bold rounded-xl"
                                  onClick={() => router.push(`/tournaments/referee/${params.id}/${match.round}/${match.match_id}`)}
                                >
                                  <Play className="size-3" />
                                  Score
                                </Button>
                              )}
                              {match.status === 'in_progress' && (
                                <Button
                                  size="sm"
                                  className="h-8 text-xs gap-1.5 font-bold rounded-xl bg-orange-500 hover:bg-orange-600"
                                  onClick={() => router.push(`/tournaments/referee/${params.id}/${match.round}/${match.match_id}`)}
                                >
                                  <Play className="size-3" />
                                  Continue
                                </Button>
                              )}
                              {match.status === 'completed' && (
                                <Badge className="text-[10px] font-bold bg-green-500 rounded-lg">✓ Done</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          );
        })()}

        {/* Referees Section */}
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-sm uppercase tracking-wider text-foreground flex items-center gap-2">
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="size-4 text-primary" />
              </div>
              Referees
            </h3>
            <Dialog
              open={isSearchDialogOpen}
              onOpenChange={setIsSearchDialogOpen}
            >
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2 font-bold rounded-lg border-border/50">
                  <UserPlus className="size-4" />
                  Add Referee
                </Button>
              </DialogTrigger>
              <DialogContent className="border-border/50">
                <DialogHeader>
                  <DialogTitle className="font-black uppercase tracking-tight">Add Referee</DialogTitle>
                  <DialogDescription>
                    Search for a player to add as a referee
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      placeholder="Search by username..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-muted/40 border-transparent focus:bg-background focus:border-input rounded-xl"
                    />
                  </div>
                  {isSearching && (
                    <div className="text-center py-4 text-muted-foreground">
                      Searching...
                    </div>
                  )}
                  {searchResults?.players &&
                    searchResults.players.length > 0 && (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {searchResults.players.map((player) => (
                          <Card
                            key={player.id}
                            className="p-3 cursor-pointer hover:bg-muted/50 transition-colors border-border/50 rounded-xl"
                            onClick={() => {
                              addRefereeMutation.mutate(player.id);
                            }}
                          >
                            <div className="flex items-center gap-3">
                              {player.photo_url ? (
                                <img src={player.photo_url} alt={player.username} className="size-10 rounded-xl object-cover shrink-0 border border-border/50" />
                              ) : (
                                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                  <Users className="size-5 text-primary" />
                                </div>
                              )}
                              <div className="flex-1">
                                <p className="font-bold text-sm">
                                  {player.username}
                                </p>
                                {player.name && player.name !== player.username && (
                                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                                    {player.name}
                                  </p>
                                )}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  {searchQuery.length >= 2 &&
                    !isSearching &&
                    searchResults?.players &&
                    searchResults.players.length === 0 && (
                      <div className="text-center py-4 text-muted-foreground">
                        No players found
                      </div>
                    )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsSearchDialogOpen(false);
                      setSearchQuery("");
                    }}
                  >
                    Cancel
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {referees.length === 0 ? (
            <Card className="p-8 text-center border-2 border-dashed border-border/50 bg-muted/5 rounded-2xl">
              <div className="flex flex-col items-center gap-3">
                <div className="size-14 rounded-2xl bg-muted/30 flex items-center justify-center">
                  <Users className="size-7 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">No referees added yet</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {referees.map((referee, index) => (
                <Card key={index} className="p-4 border-border/50 bg-background/80 backdrop-blur-sm rounded-xl hover:bg-background transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="size-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">
                          {referee.name || "Unknown"}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Referee</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (
                          confirm(
                            `Are you sure you want to remove ${referee.name} as a referee?`
                          )
                        ) {
                          removeRefereeMutation.mutate(referee.player_id);
                        }
                      }}
                      disabled={removeRefereeMutation.isPending}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                    >
                      <X className="size-5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Group Manager Section (for Group+Knockout format) - Show in Dialog if round 1 has started */}
        {isGroupKnockoutFormat && engineInfo?.current_round > 0 && (
          <div className="px-4">
            <Dialog open={isGroupManagerDialogOpen} onOpenChange={setIsGroupManagerDialogOpen}>
              <DialogTrigger asChild>
                <Card className="p-5 border-border/50 bg-background/80 backdrop-blur-sm rounded-2xl shadow-sm cursor-pointer hover:bg-background/90 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <LayoutGrid className="size-4 text-primary" />
                      </div>
                      <h3 className="font-black text-sm uppercase tracking-wider text-foreground">Group Management</h3>
                    </div>
                    <Button variant="ghost" size="sm" className="gap-2 font-bold rounded-xl">
                      <Eye className="size-4" />
                      View Groups
                    </Button>
                  </div>
                </Card>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-black uppercase tracking-tight flex items-center gap-2">
                    <LayoutGrid className="size-5 text-primary" />
                    Group Management
                  </DialogTitle>
                  <DialogDescription>
                    View and manage tournament groups
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <GroupManager tournamentId={params.id} />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Current Round Matches Section */}
        {roundStatus?.currentRound && (
          <div className="px-4 pb-4">
            <h3 className="font-black text-sm uppercase tracking-wider text-foreground flex items-center gap-2 mb-3">
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Trophy className="size-4 text-primary" />
              </div>
              {/^\d+$/.test(roundStatus?.currentRound)
                ? `Round ${roundStatus?.currentRound} Matches`
                : `${roundStatus?.currentRound} Matches`}
            </h3>
            {isLoadingMatches ? (
              <Card className="p-6 text-center border-border/50 bg-background/80 backdrop-blur-sm rounded-2xl">
                <div className="flex flex-col items-center gap-3">
                  <div className="size-8 rounded-lg bg-muted/50 animate-pulse" />
                  <p className="text-sm text-muted-foreground">Loading matches...</p>
                </div>
              </Card>
            ) : currentRoundMatches?.matches?.length === 0 ? (
              <Card className="p-8 text-center border-2 border-dashed border-border/50 bg-muted/5 rounded-2xl">
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-muted/30 p-4 rounded-2xl">
                    <Trophy className="size-7 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">
                    No matches found for this round
                  </p>
                </div>
              </Card>
            ) : (
              <div className="space-y-3">
                {currentRoundMatches?.matches?.map((match) => (
                  <Card key={match.id} className="p-5 border-border/50 bg-background/80 backdrop-blur-sm rounded-2xl hover:bg-background/90 transition-colors">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-sm">Match {match.id}</p>
                          {match.court && (
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">
                              Court {match.court}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold uppercase tracking-wider rounded-lg ${match.status === "completed"
                            ? "bg-green-500/10 text-green-600 border-green-200"
                            : match.status === "in_progress"
                              ? "bg-orange-500/10 text-orange-600 border-orange-200"
                              : "border-border/50"
                            }`}
                        >
                          {match.status?.replace("_", " ") || "pending"}
                        </Badge>
                      </div>

                      {/* Players */}
                      {match.players && match.players.length > 0 && (
                        <>
                          <Separator className="bg-border/30" />
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-2 font-bold uppercase tracking-wider">
                              Players
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {match.players.map((player, idx) => {
                                const isWinner = match.winner_players?.some(
                                  (wp) => wp.id === player.id
                                );
                                return (
                                  <Badge
                                    key={idx}
                                    variant="outline"
                                    className={`text-xs font-medium rounded-lg ${isWinner
                                      ? "bg-yellow-500/10 text-yellow-600 border-yellow-300 font-bold"
                                      : "border-border/50"
                                      }`}
                                  >
                                    {player.username}
                                    {isWinner && (
                                      <Trophy className="size-3 ml-1" />
                                    )}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}

                      {/* Winner Display */}
                      {match.status === "completed" &&
                        match.winner_players &&
                        match.winner_players.length > 0 && (
                          <>
                            <Separator className="bg-border/30" />
                            <div className="bg-yellow-500/10 border border-yellow-200 rounded-xl p-4">
                              <div className="flex items-center gap-3">
                                <div className="size-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                                  <Trophy className="size-4 text-yellow-600" />
                                </div>
                                <div>
                                  <p className="text-[10px] text-yellow-700 font-bold uppercase tracking-wider mb-1">
                                    Winner
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {match.winner_players.map((winner, idx) => (
                                      <span
                                        key={idx}
                                        className="text-sm font-bold text-yellow-800"
                                      >
                                        {winner.username}
                                        {idx < match.winner_players.length - 1 && (
                                          <span className="mx-1">&</span>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                      {/* Court and Referee Assignment */}
                      <Separator className="bg-border/30" />
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-2 block font-bold uppercase tracking-wider">
                            Assign Court
                          </label>
                          <select
                            value={match.court_id || (match.court && courts.find(c => c.court_number === match.court)?.id) || ""}
                            onChange={(e) => {
                              const courtId = e.target.value
                                ? parseInt(e.target.value)
                                : null;
                              assignCourtMutation.mutate({
                                matchId: match.id,
                                courtId,
                              });
                            }}
                            disabled={assignCourtMutation.isPending || isLoadingCourts}
                            className="w-full px-3 py-2.5 border border-border/50 rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                          >
                            <option value="">No Court</option>
                            {courts.map((court) => (
                              <option key={court.id} value={court.id}>
                                Court {court.court_number}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-2 block font-bold uppercase tracking-wider">
                            Assign Referee
                          </label>
                          <select
                            value={match.referee_id || ""}
                            onChange={(e) => {
                              const refereeId = e.target.value
                                ? parseInt(e.target.value)
                                : null;
                              assignRefereeMutation.mutate({
                                matchId: match.id,
                                refereeId,
                              });
                            }}
                            disabled={assignRefereeMutation.isPending}
                            className="w-full px-3 py-2.5 border border-border/50 rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                          >
                            <option value="">No Referee</option>
                            {referees.map((referee) => (
                              <option
                                key={referee.player_id}
                                value={referee.player_id}
                              >
                                {referee.name || `Referee ${referee.player_id}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </ScrollablePageContent>
    </ScrollablePage>
  );
}
