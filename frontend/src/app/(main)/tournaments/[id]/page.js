"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTournament } from "@/hooks/useTournament";
import { useUser } from "@/hooks/useUser";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { tournamentsApi, tournamentEngineApi } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Calendar,
  Users,
  Zap,
  Trophy,
} from "lucide-react";
import { formatTime, formatDateWithDay, getTournamentCategory } from "@/lib/utils";
import {
  ScrollablePage,
  ScrollablePageHeader,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";
import { toast } from "sonner";
import { TeamInviteDrawer } from "@/components/tournaments/TeamInviteDrawer";
import { InviteAcceptDrawer } from "@/components/tournaments/InviteAcceptDrawer";
import { useTournamentInvites } from "@/hooks/useTournamentInvites";
import { UserPlus } from "lucide-react";
import { RacquetIcon as Racquet, TicketIcon as Ticket } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

export default function TournamentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: tournament, isLoading } = useTournament(params.id);
  const { data: userData } = useUser();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isInviteDrawerOpen, setIsInviteDrawerOpen] = useState(false);
  const [isInviteDrawerActionPending, setIsInviteDrawerActionPending] = useState(false);
  const { invites, acceptInviteAsync } = useTournamentInvites(params.id);

  const inviteToken = searchParams.get("invite");

  // Fetch invite by token when ?invite= is present (e.g. from QR scan)
  const { data: inviteByTokenData, isLoading: isLoadingInviteByToken, isError: isInviteByTokenError } = useQuery({
    queryKey: ["tournament-invite-by-token", inviteToken],
    queryFn: async () => {
      const response = await tournamentsApi.getInviteByToken(inviteToken);
      return response.data.data;
    },
    enabled: !!inviteToken && !!params.id,
  });

  // If not logged in and we have invite param, redirect to token page for signup/login
  useEffect(() => {
    if (!inviteToken || isLoadingInviteByToken) return;

    if (isInviteByTokenError || (inviteToken && !inviteByTokenData && !isLoadingInviteByToken)) {
      toast.error("Invalid or expired invite link.");
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      router.replace(url.pathname + url.search);
      return;
    }
    if (inviteByTokenData) {
      const matchesTournament = Number(inviteByTokenData.tournament_id) === Number(params.id);
      const isPending = inviteByTokenData.status === "pending";
      if (matchesTournament && isPending) {
        setIsInviteDrawerOpen(true);
      } else if (inviteToken) {
        const url = new URL(window.location.href);
        url.searchParams.delete("invite");
        router.replace(url.pathname + url.search);
      }
    }
  }, [inviteToken, inviteByTokenData, isLoadingInviteByToken, isInviteByTokenError, params.id, userData?.id, router]);

  const closeInviteDrawerAndClearParam = () => {
    setIsInviteDrawerOpen(false);
    if (inviteToken) {
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      router.replace(url.pathname + url.search);
    }
  };

  const handleAcceptInviteFromDrawer = async () => {
    setIsInviteDrawerActionPending(true);
    try {
      await tournamentsApi.acceptInviteByToken(inviteToken);
      toast.success("Invite accepted! You're now on the team.");
      queryClient.invalidateQueries({ queryKey: ["tournament-invites", params.id] });
      queryClient.invalidateQueries({ queryKey: ["tournament", params.id] });
      queryClient.invalidateQueries({ queryKey: ["tournament-teams", params.id] });
      closeInviteDrawerAndClearParam();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to accept invite");
    } finally {
      setIsInviteDrawerActionPending(false);
    }
  };

  const handleRejectInviteFromDrawer = async () => {
    if (!inviteByTokenData?.id) return;
    setIsInviteDrawerActionPending(true);
    try {
      await acceptInviteAsync({ inviteId: inviteByTokenData.id, status: "rejected" });
      toast.success("Invite declined.");
      closeInviteDrawerAndClearParam();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to decline invite");
    } finally {
      setIsInviteDrawerActionPending(false);
    }
  };

  // Fetch teams for the tournament
  const { data: teamsData } = useQuery({
    queryKey: ['tournament-teams', params.id],
    queryFn: async () => {
      try {
        const response = await tournamentEngineApi.getTeams(params.id);
        return response.data.data;
      } catch (error) {
        // If teams endpoint fails, return null (fallback to flat list)
        return null;
      }
    },
    enabled: !!params.id,
    staleTime: 60 * 1000, // 1 minute
  });

  // Check if current user is the host
  const tournamentId = parseInt(params.id);
  const isHost = userData?.host_for_tournaments?.some(
    (id) => id === tournamentId || id === params.id
  ) || false;

  // Check if tournament is doubles
  const isDoubles =
    tournament?.match_format?.type?.toLowerCase().includes("doubles") || false;

  // Only show teams where both players are accepted (have player1_id and player2_id)
  const completeTeams =
    teamsData?.teams?.filter(
      (t) => t.player1_id && t.player2_id
    ) ?? [];

  // Get accepted invites to determine team
  const acceptedInvites = invites?.filter((invite) => invite.status === "accepted") || [];
  const pendingInvites = invites?.filter((invite) => invite.status === "pending") || [];

  // Get team ID from invites (check all invites, not just accepted)
  const allInvites = invites || [];
  const currentTeamId = allInvites[0]?.team_id || null;

  // Check if team is complete (2 players for doubles)
  // Team is complete when there's at least 1 accepted invite (inviter + invitee = 2 members)
  const teamComplete = isDoubles
    ? acceptedInvites.length >= 1
    : true; // Singles doesn't need team

  const registrationMutation = useMutation({
    mutationFn: () =>
      tournamentsApi.register(params.id, isDoubles && currentTeamId ? currentTeamId : null),
    onSuccess: () => {
      toast.success("Successfully registered for tournament!");
      setIsDrawerOpen(false);
      // Invalidate and refetch tournament data to update registration status
      queryClient.invalidateQueries({ queryKey: ["tournament", params.id] });
    },
    onError: (error) => {
      const errorMessage =
        error?.response?.data?.message || "Failed to register for tournament";
      toast.error(errorMessage);
    },
  });

  if (isLoading) {
    return (
      <ScrollablePage className="h-dvh bg-background">
        <ScrollablePageHeader className="relative bg-transparent pointer-events-none">
          <header className="absolute top-0 left-0 right-0 z-20 pointer-events-auto pt-safe-top">
            <div className="flex items-center justify-between px-4 py-3 bg-linear-to-b from-black/50 to-transparent">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/")}
                className="rounded-full bg-background/20 backdrop-blur-md text-white hover:bg-background/40 hover:text-white"
              >
                <ArrowLeft className="size-5" />
              </Button>
            </div>
          </header>
        </ScrollablePageHeader>
        <ScrollablePageContent className="space-y-0 pb-24">
          <div className="relative h-[45vh] w-full overflow-hidden">
            <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
              <Skeleton className="px-2 py-0.5 rounded w-16 h-4 mb-2" />
              <h1 className="text-3xl font-black italic tracking-tighter text-foreground mb-2 leading-none">
                <Skeleton className="w-5/6 h-8" />
              </h1>
              <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="size-4" />
                  <Skeleton className="w-16 h-4" />
                </div>
                <div className="size-1 rounded-full bg-muted-foreground/50" />
                <div className="flex items-center gap-1.5">
                  <Skeleton className="size-4" />
                  <Skeleton className="w-16 h-4" />
                </div>
              </div>
            </div>
          </div>
          <div className="px-4 space-y-6 pt-2">
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="w-full h-24" />
              <Skeleton className="w-full h-24" />
              <Skeleton className="w-full h-24" />
            </div>
            <div className="space-y-2">
              <Skeleton className="w-1/2 h-8" />
              <Skeleton className="w-full h-8" />
            </div>
            <div className="space-y-3">
              <Skeleton className="w-1/2 h-8" />
              <Skeleton className="w-full h-14" />
              <Skeleton className="w-full h-14" />
              <Skeleton className="w-full h-14" />
              <Skeleton className="w-full h-14" />
              <Skeleton className="w-full h-14" />
            </div>
          </div>
        </ScrollablePageContent>
      </ScrollablePage>
    );
  }

  if (!tournament) {
    return <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 px-4">
      <div className="bg-muted/30 rounded-full">
        <Trophy className="size-24" />
      </div>
      <h2 className="text-xl font-black uppercase tracking-tight">Tournament Not Found</h2>
      <p className="text-muted-foreground text-sm">This tournament doesn't exist or has been removed.</p>
      <Link href="/tournaments" className={buttonVariants({ variant: "ghost", size: "sm" })}>Go back to tournaments</Link>
    </div>;
  }

  const {
    name,
    start_date,
    end_date,
    venue,
    description,
    hosted_by,
    referee,
    capacity,
    match_format,
    game,
    registration_fee,
    registered_count,
    registered_players,
    image_url,
    metadata,
  } = tournament;

  const category = getTournamentCategory(match_format);

  const registeredCount = registered_count || 0;
  const progress = capacity > 0 ? (registeredCount / capacity) * 100 : 0;
  const isFull = capacity > 0 && registeredCount >= capacity;

  // Check if tournament has started (start_time has passed or any round has begun)
  const startTime = new Date(start_date);
  const now = new Date();
  const hasStarted = startTime <= now;
  const hasRoundBegun = metadata?.current_round > 0 || metadata?.stage !== 'registration';
  const tournamentStarted = hasStarted || hasRoundBegun;

  const isHostReferee = referee?.some((ref) => ref.name === hosted_by.name);

  return (
    <ScrollablePage className="h-dvh bg-background">
      <ScrollablePageHeader className="relative bg-transparent pointer-events-none">
        <header className="absolute top-0 left-0 right-0 z-20 pointer-events-auto pt-safe-top">
          <div className="flex items-center justify-between px-4 py-3 bg-linear-to-b from-black/50 to-transparent">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="rounded-full bg-background/20 backdrop-blur-md text-white hover:bg-background/40 hover:text-white"
            >
              <ArrowLeft className="size-5" />
            </Button>
            {/* <h1 className="text-lg font-bold text-white drop-shadow-md opacity-0 transition-opacity duration-300">Tournaments</h1> */}
          </div>
        </header>
      </ScrollablePageHeader>

      <ScrollablePageContent className="space-y-0 pb-24">
        {/* Hero Section */}
        <div className="relative h-[45svh] w-full overflow-hidden">
          {image_url ? (
            <img
              src={image_url}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-linear-to-br from-brand-blue to-teal-600 relative flex items-center justify-center">
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-white to-transparent" />
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/60 to-transparent" />

          <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground">
                {category}
              </span>
              {tournament?.status === 'live' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500 text-white animate-pulse">
                  Live
                </span>
              )}
            </div>
            <h1 className="text-3xl font-black italic tracking-tighter text-foreground mb-2 leading-none">
              {name}
            </h1>
            <div className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <MapPin className="size-4" />
                <span>{venue?.name || "TBD"}</span>
              </div>
              <div className="size-1 rounded-full bg-muted-foreground/50" />
              <div className="flex items-center gap-1.5">
                <Calendar className="size-4" />
                <span>{formatDateWithDay(start_date)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 space-y-6 pt-2">
          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50 flex flex-col items-center justify-center text-center">
              <Clock className="size-5 text-primary mb-1" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Time</span>
              <span className="text-xs font-bold">{formatTime(start_date)}</span>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50 flex flex-col items-center justify-center text-center">
              <Users className="size-5 text-primary mb-1" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Spots</span>
              <span className="text-xs font-bold">{registeredCount}/{capacity}</span>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50 flex flex-col items-center justify-center text-center">
              <Ticket className="size-5 text-primary mb-1" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Entry</span>
              <span className="text-xs font-bold">{registration_fee > 0 ? `₹${registration_fee}` : "Free"}</span>
            </div>

            <div className="bg-muted/30 rounded-xl p-3 border border-border/50 flex flex-col items-center justify-center text-center">
              <Racquet className="size-5 text-primary mb-1" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Game</span>
              <span className="text-xs font-bold">{game?.name || "TBD"}</span>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground">About Event</h3>
            <p className="text-sm text-foreground/80 leading-relaxed">
              {description || "No description provided for this tournament."}
            </p>
          </div>

          {/* Host & Referees */}
          <div className="space-y-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground">Organizers</h3>

            {/* Host */}
            {hosted_by && (
              <div className="flex items-center gap-3 bg-muted/20 p-3 rounded-xl border border-border/50">
                {hosted_by.photo_url ? (
                  <img src={hosted_by.photo_url} alt={hosted_by.name} className="size-10 rounded-full object-cover ring-2 ring-primary/10" />
                ) : (
                  <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold border border-border">
                    {hosted_by.name?.[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-bold">{hosted_by.name}</p>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Tournament Host {isHostReferee ? " & Referee" : ""}</p>
                </div>
              </div>
            )}

            {/* Referees */}
            {referee?.filter((ref) => hosted_by.name !== ref.name).map((ref, i) => (
              <div key={i} className="flex items-center gap-3 bg-muted/20 p-3 rounded-xl border border-border/50">
                {ref.photo_url ? (
                  <img src={ref.photo_url} alt={ref.name} className="size-10 rounded-full object-cover ring-2 ring-primary/10" />
                ) : (
                  <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold border border-border">
                    {ref.name?.[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-bold">{ref.name}</p>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{ref.role || "Official Referee"}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Registered Players / Teams */}
          <div className="space-y-3 pb-8">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground">
                {completeTeams.length > 0 ? `Teams (${completeTeams.length})` : `Roster (${registeredCount})`}
              </h3>
              {progress > 0 && (
                <div className="text-xs font-bold text-primary">{Math.round(progress)}% Full</div>
              )}
            </div>

            <div className="grid gap-3">
              {completeTeams.length > 0 ? (
                // Show teams only when both players are accepted
                completeTeams.map((team) => {
                  // Find player objects from registered_players (use == for id type mismatch)
                  const player1 = registered_players?.find(p => Number(p.id) === Number(team.player1_id));
                  const player2 = registered_players?.find(p => Number(p.id) === Number(team.player2_id));

                  // Build team members: use full player when in registered_players, else fallback from team names (engine/teams returns player1_name, player2_name)
                  const teamMembers = [
                    player1 || (team.player1_id ? { id: team.player1_id, name: team.player1_name, username: team.player1_name, photo_url: null, aura: null } : null),
                    player2 || (team.player2_id ? { id: team.player2_id, name: team.player2_name, username: team.player2_name, photo_url: null, aura: null } : null),
                  ].filter(Boolean);

                  return (
                    <div
                      key={team.team_id}
                      className="bg-muted/20 rounded-xl border border-border/50 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {team.display_name || `Team ${team.team_id}`}
                        </span>
                        {team.avg_rating > 0 && (
                          <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                            AURA{" "}
                            {(team.avg_rating || 0).toFixed(1)} Avg
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {teamMembers.length > 0 && (
                          teamMembers.map((player) => (
                            <div
                              key={player.id}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                              onClick={() => router.push(`/players/${player.id}`)}
                            >
                              <div className="relative">
                                {player.photo_url ? (
                                  <img src={player.photo_url} alt={player.name} className="size-10 rounded-full object-cover border border-border" />
                                ) : (
                                  <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground border border-border">
                                    <Users className="size-5" />
                                  </div>
                                )}
                                <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 border border-border">
                                  <div className="bg-green-500 size-2.5 rounded-full" />
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold truncate">{player.name || player.username}</p>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                                    <Zap className="size-3 fill-primary text-primary" /> {player.aura?.toFixed(1) || "0.0"} Aura
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })
              ) : registered_players && registered_players.length > 0 ? (
                // Fallback to flat list if no teams
                registered_players.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/players/${player.id}`)}
                  >
                    <div className="relative">
                      {player.photo_url ? (
                        <img src={player.photo_url} alt={player.name} className="size-10 rounded-full object-cover border border-border" />
                      ) : (
                        <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground border border-border">
                          <Users className="size-5" />
                        </div>
                      )}
                      <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 border border-border">
                        <div className="bg-green-500 size-2.5 rounded-full" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{player.name || player.username}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                          <Zap className="size-3 fill-primary text-primary" /> {player.aura?.toFixed(1) || "0.0"} Aura
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 bg-muted/20 rounded-xl border border-dashed border-border">
                  <Users className="size-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">No players registered yet.</p>
                  <p className="text-xs text-muted-foreground/70">Be the first to join!</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </ScrollablePageContent>

      {/* Book Now / Show Stats Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 z-50 bg-linear-to-t from-background via-background to-transparent pt-12 pointer-events-none md:relative md:bg-transparent md:p-0">
        <div className="max-w-md mx-auto w-full space-y-2 pointer-events-auto pb-4">
          {isHost ? (
            <div className="w-full px-4 py-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
              <p className="text-sm font-bold text-primary">Hosted by you</p>
              <Button
                variant="outline"
                className="mt-2 w-full"
                onClick={() => router.push(`/tournaments/${params.id}/manage`)}
              >
                Manage Tournament
              </Button>
            </div>
          ) : (
            <>
              {isDoubles && !tournament?.registered && new Date(start_date) > new Date() && !teamComplete && !isFull && (
                <Button
                  variant="secondary"
                  className="w-full rounded-xl shadow-lg border border-border/50"
                  onClick={() => setIsInviteDialogOpen(true)}
                >
                  <UserPlus className="size-4 mr-2" />
                  {currentTeamId && teamComplete ? "View Team" : "Invite Partner"}
                </Button>
              )}
              {isDoubles && teamComplete && new Date(start_date) > new Date() && (
                <div className="w-full px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-center">
                  <p className="text-sm font-medium text-green-800">✓ Team Registered</p>
                  <p className="text-xs text-green-600">You and your partner are registered for this tournament</p>
                </div>
              )}
              <Button
                className="w-full h-14 rounded-xl shadow-xl shadow-primary/25 text-lg font-black uppercase tracking-wide"
                onClick={() => {
                  const isRegistered = tournament?.registered || (isDoubles && teamComplete);

                  if (isRegistered || tournamentStarted) {
                    router.push(`/tournaments/${params.id}/stats`);
                  } else if (!isFull) {
                    setIsDrawerOpen(true);
                  }
                }}
                disabled={registrationMutation.isPending || (isFull && !tournamentStarted)}
              >
                {isFull && !tournamentStarted
                  ? "Tournament Full"
                  : tournamentStarted || tournament?.registered || (isDoubles && teamComplete)
                    ? "View Pairings & Leaderboard"
                    : "Book Your Spot"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Registration Confirmation Drawer */}
      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Confirm Registration</DrawerTitle>
            <DrawerDescription>
              Are you sure you want to register for {name}?
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 py-2 space-y-2">
            {isFull && (
              <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm font-medium text-red-900">Tournament Full</p>
                <p className="text-xs text-red-700 mt-1">
                  This tournament has reached its capacity of {capacity} players. Registration is no longer available.
                </p>
              </div>
            )}
            {isDoubles && (
              <div className="mb-4 p-3 bg-purple-50 rounded-lg">
                <p className="text-sm font-medium text-purple-900 mb-2">Team Registration</p>
                {!teamComplete ? (
                  <div className="space-y-2">
                    <p className="text-sm text-purple-700">
                      You need to invite a partner before registering.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsDrawerOpen(false);
                        setIsInviteDialogOpen(true);
                      }}
                      className="w-full"
                    >
                      <UserPlus className="size-4 mr-2" />
                      Invite Partner
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-purple-700">Team is ready!</p>
                    {pendingInvites.length > 0 && (
                      <p className="text-xs text-purple-600">
                        {pendingInvites.length} pending invite(s)
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Tournament:</span>
              <span className="font-medium">{name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Date:</span>
              <span className="font-medium">
                {formatDateWithDay(start_date)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Time:</span>
              <span className="font-medium">
                {formatTime(start_date)} - {formatTime(end_date)}
              </span>
            </div>
            {registration_fee > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Registration Fee:</span>
                <span className="font-medium">
                  ${registration_fee.toFixed(2)}
                </span>
              </div>
            )}
          </div>
          <DrawerFooter>
            <Button
              onClick={() => registrationMutation.mutate()}
              disabled={registrationMutation.isPending || (isDoubles && !teamComplete) || isFull}
              className="w-full"
              size="lg"
            >
              {registrationMutation.isPending
                ? "Registering..."
                : isFull
                  ? "Tournament Full"
                  : "Confirm Registration"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsDrawerOpen(false)}
              disabled={registrationMutation.isPending}
              className="w-full"
            >
              Cancel
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Invite from QR / link – new drawer showing invite details and accept/reject */}
      <InviteAcceptDrawer
        open={isInviteDrawerOpen}
        onOpenChange={(open) => !open && closeInviteDrawerAndClearParam()}
        inviteData={inviteByTokenData}
        onAccept={handleAcceptInviteFromDrawer}
        onReject={handleRejectInviteFromDrawer}
        isAccepting={isInviteDrawerActionPending}
      />

      {/* Team Invite Dialog */}
      {isDoubles && (
        <TeamInviteDrawer
          open={isInviteDialogOpen}
          onOpenChange={setIsInviteDialogOpen}
          tournamentId={parseInt(params.id)}
          teamId={currentTeamId}
        />
      )}
    </ScrollablePage>
  );
}
