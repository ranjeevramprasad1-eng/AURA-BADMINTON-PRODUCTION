"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import { useAuth } from "@/contexts/AuthContext";
import { tournamentsApi, matchesApi } from "@/lib/api";
import { createWebSocketConnection } from "@/lib/websocket";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TournamentCard } from "@/components/tournaments/TournamentCard";
import {
  ScrollablePage,
  ScrollablePageHeader,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";
import {
  LogOut,
  User,
  Trophy,
  Hash,
  Activity,
  Zap,
  Plus,
  ChevronRight,
  MapPin,
  CalendarDays,
  Users,
} from "lucide-react";
import Link from "next/link";

export default function ProfilePage() {
  const router = useRouter();
  const { data: userData, isLoading } = useUser();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const wsConnectionsRef = useRef({});

  // Fetch referee tournaments
  const { data: refereeData, isLoading: isLoadingReferee } = useQuery({
    queryKey: ["referee-tournaments"],
    queryFn: async () => {
      const response = await tournamentsApi.getReferee();
      return response.data.data;
    },
  });

  // Fetch hosted tournaments
  const { data: hostedData, isLoading: isLoadingHosted } = useQuery({
    queryKey: ["hosted-tournaments"],
    queryFn: async () => {
      const response = await tournamentsApi.getHosted();
      return response.data.data;
    },
  });

  // Fetch referee matches
  const { data: refereeMatchesData, isLoading: isLoadingRefereeMatches } =
    useQuery({
      queryKey: ["referee-matches"],
      queryFn: async () => {
        const response = await matchesApi.getRefereeMatches();
        return response.data.data;
      },
    });

  // Fetch registered tournaments
  const { data: registeredData, isLoading: isLoadingRegistered } = useQuery({
    queryKey: ["registered-tournaments"],
    queryFn: async () => {
      const response = await tournamentsApi.getRegistered();
      return response.data.data;
    },
  });

  const now = new Date();
  // Add 1 day buffer for night tournaments that stretch into early morning
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Helper to get tournament end date
  const getTournamentEndDate = (match) => {
    const dateStr = match.tournament_end_date || match.end_date || match.end_time || match.tournament?.end_date || match.tournament?.end_time;
    return dateStr ? new Date(dateStr) : null;
  };

  // Helper to check if tournament has ended
  const hasTournamentEnded = (match) => {
    const tournamentEndDate = getTournamentEndDate(match);
    if (!tournamentEndDate) return false;
    const endDateWithBuffer = new Date(tournamentEndDate.getTime() + ONE_DAY_MS);
    return now > endDateWithBuffer;
  };

  // Safely get tournaments from userData
  const tournaments = userData?.tournaments || [];

  // Filter matches by status AND tournament end date
  const liveMatches =
    tournaments?.filter((t) => {
      if (hasTournamentEnded(t)) {
        return false;
      }
      return t.status === "scheduled" || t.status === "in_progress";
    }) || [];

  // Get active tournaments (registered and not ended) for WebSocket connections
  // We connect to ALL active tournaments so we receive "pairings_generated" events even if we don't have a match yet
  const activeTournamentIds = (registeredData?.tournaments || [])
    .filter(t => !hasTournamentEnded(t))
    .map(t => t.id || t.tournament_id);

  // WebSocket connections for tournament updates
  useEffect(() => {
    if (!activeTournamentIds || activeTournamentIds.length === 0) return;

    // Clean up connections for tournaments that are no longer relevant
    Object.keys(wsConnectionsRef.current).forEach(id => {
      if (!activeTournamentIds.includes(Number(id))) {
        if (wsConnectionsRef.current[id]) {
          wsConnectionsRef.current[id].close();
          delete wsConnectionsRef.current[id];
        }
      }
    });

    // Create new connections
    activeTournamentIds.forEach(id => {
      if (wsConnectionsRef.current[id]) return; // Already connected

      const ws = createWebSocketConnection(`/ws/tournament/${id}/updates`, {
        onMessage: (data) => {
          if (data.type === "match_start" || data.type === "match_complete" || data.type === "match_update" || data.type === "pairings_generated") {
            // Update user details to reflect new match status or new pairings
            queryClient.invalidateQueries({ queryKey: ["user", "details"] });
            // Also refresh registered tournaments in case status changed
            queryClient.invalidateQueries({ queryKey: ["registered-tournaments"] });
          }
        },
        reconnect: true,
      });
      wsConnectionsRef.current[id] = ws;
    });
  }, [activeTournamentIds.join(','), queryClient]);

  // Global cleanup
  useEffect(() => {
    return () => {
      Object.values(wsConnectionsRef.current).forEach(ws => ws && ws.close());
    };
  }, []);

  if (isLoading) {
    return (
      <ScrollablePage className="bg-background/20">
        <ScrollablePageHeader className="pb-0 bg-transparent">
          <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 h-14" />
        </ScrollablePageHeader>
        <ScrollablePageContent className="pb-24">
          <div className="flex flex-col items-center py-8">
            <div className="size-28 rounded-full bg-muted animate-pulse mb-4" />
            <div className="h-8 w-40 bg-muted animate-pulse rounded-md mb-2" />
            <div className="h-4 w-24 bg-muted animate-pulse rounded-md" />
            <div className="mt-6 w-[300px] h-32 bg-muted animate-pulse rounded-2xl" />
          </div>
          <div className="px-4 space-y-4">
            <div className="h-12 w-full bg-muted animate-pulse rounded-full" />
            <div className="h-32 w-full bg-muted animate-pulse rounded-xl" />
            <div className="h-32 w-full bg-muted animate-pulse rounded-xl" />
          </div>
        </ScrollablePageContent>
      </ScrollablePage>
    );
  }

  if (!userData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center space-y-4">
        <div className="bg-muted p-4 rounded-full">
          <User className="size-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold">Profile Not Found</h2>
        <p className="text-muted-foreground">
          Please log in to view your profile.
        </p>
        <Button onClick={() => router.push("/login")}>Log In</Button>
      </div>
    );
  }

  const { name, username, aura, age, gender, photo_url } = userData;



  // Past matches: completed status OR from tournaments that have ended (with buffer)
  const pastMatches =
    tournaments?.filter((t) => {
      // If tournament ended more than 1 day ago, show in Past
      if (hasTournamentEnded(t)) {
        return true;
      }
      // Otherwise, only show if match is completed (won, lost, etc.)
      return t.status !== "scheduled" && t.status !== "in_progress";
    }) || [];

  // Get registered tournaments and filter for past ones
  const allRegisteredTournaments = registeredData?.tournaments || [];

  // Past tournaments: have ended (with 1 day buffer for Past tab)
  const pastTournaments = allRegisteredTournaments.filter((tournament) => {
    const endDate = tournament.end_date ? new Date(tournament.end_date) : null;
    if (!endDate) return false;
    // Add 1 day buffer
    const endDateWithBuffer = new Date(endDate.getTime() + ONE_DAY_MS);
    return now > endDateWithBuffer;
  });

  // Helper to get partner name from match
  const getPartnerName = (match) => {
    if (!match.players || match.players.length === 0) return "Partner";
    // Find current user in players
    const me = match.players.find((p) => p.username === username);
    if (!me) return "Partner";
    // Find partner (same team, different player)
    const partner = match.players.find(
      (p) => p.team === me.team && p.username !== username,
    );
    return partner?.name || partner?.username || "Partner";
  };

  // Helper to get teammate and opponents from match
  const getMatchTeams = (match) => {
    if (!match.players || match.players.length === 0) {
      return { teammate: null, opponents: [] };
    }

    // Find current user in players
    const me = match.players.find((p) => p.username === username);
    if (!me) {
      return { teammate: null, opponents: [] };
    }

    // Find teammate (same team, different player)
    const teammate = match.players.find(
      (p) => p.team === me.team && p.username !== username,
    );

    // Find opponents (different team)
    const opponents = match.players.filter((p) => p.team !== me.team);

    return {
      teammate: teammate ? teammate.name || teammate.username : null,
      opponents: opponents.map((p) => p.name || p.username),
    };
  };

  // Get all referee tournaments
  const allRefereeTournaments = refereeData?.tournaments || [];

  // Get all referee matches (filter out bye matches)
  const allRefereeMatches = (refereeMatchesData?.matches || []).filter(
    (match) => match.status !== "bye",
  );

  // Get all hosted tournaments
  const allHostedTournaments = hostedData?.tournaments || [];

  return (
    <ScrollablePage className="bg-background">
      {/* Dynamic Header */}
      <ScrollablePageHeader className="pb-0 bg-transparent">
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xl font-black italic tracking-tighter text-foreground">
                AURA
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>
      </ScrollablePageHeader>

      <ScrollablePageContent className="pb-24">
        {/* Sporty Profile Header */}
        <div className="relative overflow-hidden mb-6">
          {/* Abstract Background Shapes */}
          <div className="absolute top-0 inset-x-0 h-48 bg-linear-to-b from-brand-blue/10 to-transparent skew-y-3 origin-top-left scale-110" />
          <div className="absolute top-0 right-0 size-64 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16" />

          <div className="flex flex-col items-center pt-8 pb-4 relative z-10 px-4">
            {/* Avatar with "Pro Ring" */}
            <div className="relative mb-4 group">
              <div className="absolute -inset-1 bg-linear-to-br from-brand-blue via-primary to-brand-green rounded-full animate-in spin-in-3 duration-1000 opacity-80" />
              <div className="absolute -inset-1 bg-linear-to-br from-brand-blue via-primary to-brand-green rounded-full blur-sm opacity-50" />
              {photo_url ? (
                <img
                  src={photo_url}
                  alt={name || username || "Profile"}
                  className="size-32 rounded-full object-cover border-4 border-background relative z-10"
                />
              ) : (
                <div className="size-32 bg-background rounded-full flex items-center justify-center border-4 border-background relative z-10">
                  <User className="size-12 text-muted-foreground" />
                </div>
              )}
            </div>

            <h2 className="text-3xl font-black italic tracking-tight uppercase text-foreground">
              {name || username}
            </h2>
            <div className="capitalize flex items-center gap-3 mt-1 text-sm font-medium text-muted-foreground">
              <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-md">
                <User className="size-3" /> {gender || "Athlete"}
              </span>
              <span className="w-px h-3 bg-border" />
              <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-md">
                <Activity className="size-3" /> {age} Yrs
              </span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="px-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Main Aura Card - "AURA CARD" */}
              <Card className="col-span-2 relative overflow-hidden bg-foreground text-background border-none shadow-xl">
                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-size-[10px_10px]" />
                <div className="absolute right-0 top-0 size-32 bg-linear-to-br from-primary to-transparent opacity-20 blur-2xl rounded-full transform translate-x-12 -translate-y-12" />

                <div className="relative z-10 p-5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-primary mb-1">
                      <Zap className="size-4 fill-primary" />
                      <span className="text-xs font-bold tracking-widest uppercase">
                        Aura Rating
                      </span>
                    </div>
                    <div className="text-5xl font-black italic tracking-tighter leading-none">
                      {aura ? aura.toFixed(2) : "0.00"}
                    </div>
                  </div>
                </div>
              </Card>


            </div>
          </div>
        </div>

        {/* Tournaments Section */}
        <div className="px-4">
          {/* Sporty Tabs */}
          <Tabs defaultValue="player" className="w-full">
            <TabsList className="w-full h-12 p-1.5 bg-muted/30 rounded-xl grid grid-cols-3 mb-0">
              <TabsTrigger
                value="player"
                className="rounded-lg text-xs font-bold uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
              >
                Player
              </TabsTrigger>
              <TabsTrigger
                value="host"
                className="rounded-lg text-xs font-bold uppercase data-[state=active]:bg-foreground data-[state=active]:text-background transition-all"
              >
                Host
              </TabsTrigger>
              <TabsTrigger
                value="referee"
                className="rounded-lg text-xs font-bold uppercase data-[state=active]:bg-foreground data-[state=active]:text-background transition-all"
              >
                Referee
              </TabsTrigger>
            </TabsList>

            {/* Player Tab with nested Live/Past tabs */}
            <TabsContent value="player" className="space-y-4 mt-0">
              <Tabs defaultValue="live" className="w-full">
                <div className="flex justify-end">
                  <TabsList className="bg-muted/20 rounded-lg mb-4 grid grid-cols-2 border p-0">
                    <TabsTrigger
                      value="live"
                      className="text-xs border-0 rounded-r-none border-r border-border px-2 font-bold uppercase data-[state=active]:text-primary data-[state=active]:shadow-none transition-all"
                    >
                      Live
                    </TabsTrigger>
                    <TabsTrigger
                      value="past"
                      className="text-xs px-2 font-bold uppercase data-[state=active]:text-primary data-[state=active]:shadow-none bg-transparent transition-all"
                    >
                      Past
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Live Matches Tab */}
                <TabsContent value="live" className="space-y-4">
                  {/* Live Matches (matches user is playing in) */}
                  {liveMatches.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="size-2 rounded-full bg-red-500 animate-pulse" />
                        <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                          Upcoming Matches
                        </h4>
                      </div>
                      {liveMatches.map((match) => {
                        const isInProgress = match.status === "in_progress";
                        const isScheduled = match.status === "scheduled";
                        const { teammate, opponents } = getMatchTeams(match);

                        return (
                          <Card
                            key={match.match_id}
                            className={`py-0 gap-0 overflow-hidden border-2 ${isInProgress ? "border-primary/20 shadow-lg" : "border-border/50"} shadow-sm`}
                          >
                            {/* Header */}
                            <div className="bg-primary/5 p-3 flex justify-between items-center border-b border-primary/10">
                              <div className="flex flex-col gap-0.5">
                                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                  {match.tournament_name}
                                </div>
                                <div className="text-xs font-bold uppercase tracking-wide text-primary">
                                  {match.round}
                                </div>
                              </div>
                              {isInProgress ? (
                                <div className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded animate-pulse">
                                  LIVE
                                </div>
                              ) : isScheduled ? (
                                <div className="bg-blue-500/10 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded">
                                  SCHEDULED
                                </div>
                              ) : null}
                            </div>

                            {/* Teams Info */}
                            <div className="p-4 bg-linear-to-b from-background to-muted/20">
                              {/* Teams Display - Side by Side */}
                              <div className="grid grid-cols-2 gap-4 mb-4">
                                {/* Your Team */}
                                <div className="flex flex-col gap-2">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                                    Your Team
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="size-9 rounded-full bg-linear-to-br from-brand-blue/20 to-brand-blue/10 flex items-center justify-center border-2 border-brand-blue/30 text-brand-blue font-black text-xs shadow-sm">
                                      {username?.charAt(0).toUpperCase() || "Y"}
                                    </div>
                                    {teammate ? (
                                      <>
                                        <div className="size-9 rounded-full bg-linear-to-br from-brand-blue/20 to-brand-blue/10 flex items-center justify-center border-2 border-brand-blue/30 text-brand-blue font-black text-xs shadow-sm">
                                          {teammate.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col min-w-0 flex-1">
                                          <span className="text-xs font-bold text-foreground truncate">
                                            {username}
                                          </span>
                                          <span className="text-xs font-medium text-muted-foreground truncate">
                                            {teammate}
                                          </span>
                                        </div>
                                      </>
                                    ) : (
                                      <div className="flex flex-col min-w-0 flex-1">
                                        <span className="text-xs font-bold text-foreground truncate">
                                          {username}
                                        </span>
                                        <span className="text-[10px] font-medium text-muted-foreground">
                                          Solo
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Opponents */}
                                {opponents.length > 0 && (
                                  <div className="flex flex-col gap-2">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                                      Opponents
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {opponents
                                        .slice(0, 2)
                                        .map((opponent, idx) => (
                                          <div
                                            key={idx}
                                            className="size-9 rounded-full bg-linear-to-br from-brand-green/20 to-brand-green/10 flex items-center justify-center border-2 border-brand-green/30 text-brand-green font-black text-xs shadow-sm"
                                          >
                                            {opponent.charAt(0).toUpperCase()}
                                          </div>
                                        ))}
                                      {opponents.length > 2 && (
                                        <div className="size-9 rounded-full bg-muted flex items-center justify-center border-2 border-border text-muted-foreground font-black text-[10px] shadow-sm">
                                          +{opponents.length - 2}
                                        </div>
                                      )}
                                      <div className="flex flex-col min-w-0 flex-1">
                                        {opponents
                                          .slice(0, 2)
                                          .map((opponent, idx) => (
                                            <span
                                              key={idx}
                                              className={`text-xs font-medium text-foreground truncate ${idx === 0 ? "font-bold" : ""}`}
                                            >
                                              {opponent}
                                            </span>
                                          ))}
                                        {opponents.length > 2 && (
                                          <span className="text-[10px] font-medium text-muted-foreground">
                                            +{opponents.length - 2} more
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Score Display (only show if match is in progress) */}
                              {isInProgress && (
                                <div className="pt-4 border-t border-border/50">
                                  <div className="flex items-center justify-between">
                                    {/* Team A */}
                                    <div className="flex flex-col items-center gap-2 flex-1">
                                      <div className="size-12 rounded-full bg-linear-to-br from-brand-blue/20 to-brand-blue/10 flex items-center justify-center border-2 border-brand-blue/30 text-brand-blue font-black text-base shadow-md">
                                        A
                                      </div>
                                      <span className="text-3xl font-black tabular-nums">
                                        {match.scores?.teamA || 0}
                                      </span>
                                    </div>

                                    {/* VS */}
                                    <div className="text-sm font-bold text-muted-foreground/50 italic px-4">
                                      VS
                                    </div>

                                    {/* Team B */}
                                    <div className="flex flex-col items-center gap-2 flex-1">
                                      <span className="text-3xl font-black tabular-nums">
                                        {match.scores?.teamB || 0}
                                      </span>
                                      <div className="size-12 rounded-full bg-linear-to-br from-brand-green/20 to-brand-green/10 flex items-center justify-center border-2 border-brand-green/30 text-brand-green font-black text-base shadow-md">
                                        B
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Court Info */}
                              {match.court && (
                                <div
                                  className={`flex items-center justify-center gap-1.5 text-xs text-muted-foreground ${isInProgress ? "mt-4 pt-4 border-t border-border/50" : "mt-2"}`}
                                >
                                  <MapPin className="size-3.5" />
                                  <span className="font-medium">
                                    Court {match.court}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="p-3 bg-muted/30 border-t border-border/50 grid grid-cols-2 gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                className="gap-1.5 text-xs font-bold"
                                onClick={() =>
                                  router.push(
                                    `/tournaments/${match.tournament_id}/${match.round}/${match.match_id}`,
                                  )
                                }
                              >
                                Go to Match
                                <ChevronRight className="size-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-xs font-bold"
                                onClick={() =>
                                  router.push(
                                    `/tournaments/${match.tournament_id}/stats`,
                                  )
                                }
                              >
                                View Tournament
                                <ChevronRight className="size-3.5" />
                              </Button>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 border-2 border-dashed border-border/50 rounded-2xl bg-muted/5">
                      <div className="bg-muted/30 p-4 rounded-full">
                        <Trophy className="size-8 text-muted-foreground/30" />
                      </div>
                      <p className="text-muted-foreground text-sm font-medium">
                        No matches in progress.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push("/tournaments")}
                      >
                        Find a Tournament
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* Past Matches Tab */}
                <TabsContent value="past" className="space-y-3 mt-0">
                  {pastMatches.length > 0 ? (
                    pastMatches.map((match) => (
                      <Card
                        key={match.match_id}
                        className="p-0 border-border/50 overflow-hidden"
                      >
                        <div className="flex">
                          {/* W/L Indicator Strip */}
                          <div
                            className={`w-1.5 ${match.status === "won" ? "bg-green-500" : match.status === "lost" ? "bg-red-500" : "bg-muted-foreground"}`}
                          />

                          <div className="flex-1">
                            <div className="p-3">
                              <div className="flex justify-between items-center mb-2">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                    {match.tournament_name}
                                  </span>
                                  <span className="text-xs font-bold uppercase text-primary">
                                    {match.round}
                                  </span>
                                </div>
                                <span
                                  className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${match.status === "won"
                                    ? "bg-green-500/10 text-green-600"
                                    : match.status === "lost"
                                      ? "bg-red-500/10 text-red-600"
                                      : "bg-muted text-muted-foreground"
                                    }`}
                                >
                                  {match.status === "won"
                                    ? "Victory"
                                    : match.status === "lost"
                                      ? "Defeat"
                                      : match.status}
                                </span>
                              </div>

                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-bold">
                                    You & {getPartnerName(match)}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 font-mono font-black text-lg">
                                  <span
                                    className={
                                      match.status === "won"
                                        ? "text-green-600"
                                        : ""
                                    }
                                  >
                                    {match.scores?.teamA || 0}
                                  </span>
                                  <span className="text-muted-foreground/30">
                                    -
                                  </span>
                                  <span
                                    className={
                                      match.status === "lost"
                                        ? "text-red-500"
                                        : ""
                                    }
                                  >
                                    {match.scores?.teamB || 0}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="px-3 pb-3 flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="flex-1 gap-1.5 text-xs font-medium h-8"
                                onClick={() =>
                                  router.push(
                                    `/tournaments/${match.tournament_id}/${match.round}/${match.match_id}`,
                                  )
                                }
                              >
                                View Match
                                <ChevronRight className="size-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="flex-1 gap-1.5 text-xs font-medium h-8"
                                onClick={() =>
                                  router.push(
                                    `/tournaments/${match.tournament_id}/stats`,
                                  )
                                }
                              >
                                Tournament
                                <ChevronRight className="size-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 border-2 border-dashed border-border/50 rounded-2xl bg-muted/5">
                      <div className="bg-muted/30 p-4 rounded-full">
                        <Hash className="size-8 text-muted-foreground/30" />
                      </div>
                      <p className="text-muted-foreground text-sm font-medium">
                        No match history recorded.
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Host Tournaments Tab */}
            <TabsContent value="host" className="space-y-4 mt-0">
              <Button
                className="w-full gap-2 mb-4"
                variant="outline"
                onClick={() => router.push("/tournaments/new")}
              >
                <Plus className="size-4" />
                Create Tournament
              </Button>
              {isLoadingHosted ? (
                <div className="space-y-3">
                  <div className="h-32 w-full bg-muted/40 animate-pulse rounded-xl" />
                </div>
              ) : allHostedTournaments.length > 0 ? (
                allHostedTournaments.map((tournament) => {
                  const registeredCount = tournament.registered_count || 0;
                  const capacity = tournament.capacity || 0;
                  const progress =
                    capacity > 0 ? (registeredCount / capacity) * 100 : 0;

                  // Determine tournament status
                  const now = new Date();
                  const startDate = tournament.start_date
                    ? new Date(tournament.start_date)
                    : null;
                  const endDate = tournament.end_date
                    ? new Date(tournament.end_date)
                    : null;
                  let status = "upcoming";
                  let statusLabel = "Upcoming";
                  let statusColor = "bg-blue-500/10 text-blue-600";

                  if (startDate && endDate) {
                    if (now >= startDate && now <= endDate) {
                      status = "live";
                      statusLabel = "Live";
                      statusColor = "bg-red-500/10 text-red-600 animate-pulse";
                    } else if (now > endDate) {
                      status = "completed";
                      statusLabel = "Completed";
                      statusColor = "bg-green-500/10 text-green-600";
                    }
                  }

                  return (
                    <Card
                      key={tournament.id}
                      onClick={() =>
                        router.push(`/tournaments/${tournament.id}/manage`)
                      }
                      className="cursor-pointer overflow-hidden border-border/50 p-0 hover:border-primary/50 transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-primary/10"
                    >
                      <div className="p-4 space-y-4">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-black tracking-tight uppercase italic line-clamp-1 text-foreground mb-1">
                              {tournament.name}
                            </h3>
                            {tournament.venue?.name && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="size-3" />
                                <span className="line-clamp-1">
                                  {tournament.venue.name}
                                </span>
                              </div>
                            )}
                          </div>
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded uppercase shrink-0 ${statusColor}`}
                          >
                            {statusLabel}
                          </span>
                        </div>

                        {/* Registration Stats */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Users className="size-3.5" />
                              Registrations
                            </span>
                            <span className="font-black text-foreground">
                              {registeredCount}/{capacity} Teams
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-linear-to-r from-brand-blue to-brand-green transition-all duration-300"
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                          {capacity > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {capacity - registeredCount} spots remaining
                            </div>
                          )}
                        </div>

                        {/* Tournament Details */}
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
                          <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg border border-border/50">
                            <CalendarDays className="size-3.5 text-primary" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-foreground uppercase truncate">
                                {tournament.start_date
                                  ? new Date(
                                    tournament.start_date,
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })
                                  : "TBD"}
                              </span>
                              <span className="text-[10px] font-medium text-muted-foreground">
                                Start Date
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg border border-border/50">
                            <Trophy className="size-3.5 text-primary" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-foreground uppercase truncate">
                                {tournament.match_format?.eligible_gender ===
                                  "M"
                                  ? "Men's"
                                  : tournament.match_format?.eligible_gender ===
                                    "W"
                                    ? "Women's"
                                    : "Mixed"}
                              </span>
                              <span className="text-[10px] font-medium text-muted-foreground">
                                Format
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action Button */}
                        <Link
                          href={`/tournaments/${tournament.id}/manage`}
                          className={buttonVariants({
                            variant: status === "live" ? "default" : "outline",
                            className: "w-full gap-2 font-bold",
                          })}
                        >
                          {status === "live" ? (
                            <>
                              <Activity className="size-4" />
                              Manage Tournament
                            </>
                          ) : (
                            <>
                              Manage Tournament
                              <ChevronRight className="size-4" />
                            </>
                          )}
                        </Link>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 border-2 border-dashed border-border/50 rounded-2xl bg-muted/5">
                  <div className="bg-muted/30 p-4 rounded-full">
                    <Trophy className="size-8 text-muted-foreground/30" />
                  </div>
                  <p className="text-muted-foreground text-sm font-medium">
                    You haven't hosted any tournaments yet.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/tournaments/new")}
                  >
                    Host Your First Tournament
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Referee Matches Tab */}
            <TabsContent value="referee" className="space-y-4 mt-0">
              {isLoadingRefereeMatches || isLoadingReferee ? (
                <div className="space-y-3">
                  <div className="h-32 w-full bg-muted/40 animate-pulse rounded-xl" />
                  <div className="h-32 w-full bg-muted/40 animate-pulse rounded-xl" />
                </div>
              ) : allRefereeMatches.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="size-4 text-primary" />
                    <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                      Matches to Officiate
                    </h4>
                  </div>
                  {allRefereeMatches.map((match) => (
                    <Card
                      key={match.id}
                      className="py-0 overflow-hidden border-border/50"
                    >
                      <div className="flex">
                        {/* Status Indicator */}
                        <div
                          className={`w-1.5 ${match.status === "in_progress"
                            ? "bg-red-500"
                            : match.status === "completed"
                              ? "bg-green-500"
                              : "bg-yellow-500"
                            }`}
                        />

                        <div className="flex-1 p-3">
                          {/* Header */}
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                {match.tournament?.name || "Tournament"}
                              </span>
                              <span className="text-xs font-bold uppercase text-primary">
                                {match.round}
                              </span>
                            </div>
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${match.status === "in_progress"
                                ? "bg-red-500/10 text-red-600 animate-pulse"
                                : match.status === "completed"
                                  ? "bg-green-500/10 text-green-600"
                                  : "bg-yellow-500/10 text-yellow-600"
                                }`}
                            >
                              {match.status === "in_progress"
                                ? "LIVE"
                                : match.status === "completed"
                                  ? "DONE"
                                  : "PENDING"}
                            </span>
                          </div>

                          {/* Players/Teams */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-medium truncate flex-1">
                              {match.players?.length > 0
                                ? match.players
                                  .map((p) => p.username)
                                  .join(" & ")
                                  .substring(0, 30) +
                                (match.players.length > 2 ? "..." : "")
                                : "Teams TBD"}
                            </div>
                            {match.scores && (
                              <div className="flex items-center gap-2 font-mono font-bold text-lg">
                                <span>{match.scores.teamA || 0}</span>
                                <span className="text-muted-foreground/30">
                                  -
                                </span>
                                <span>{match.scores.teamB || 0}</span>
                              </div>
                            )}
                          </div>

                          {/* Action Button */}
                          <Link
                            className={buttonVariants({
                              variant:
                                match.status === "completed"
                                  ? "outline"
                                  : "default",
                              className: "w-full gap-2 font-bold",
                              size: "sm",
                            })}
                            href={`/tournaments/referee/${match.tournament_id}/${match.round}/${match.id}`}
                          >
                            {match.status === "in_progress" ? (
                              <>
                                <Zap className="size-4" /> Continue Scoring
                              </>
                            ) : match.status === "completed" ? (
                              <>View Match</>
                            ) : (
                              <>
                                <Zap className="size-4" /> Score Match
                              </>
                            )}
                            <ChevronRight className="size-4" />
                          </Link>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : allRefereeTournaments.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground text-center mb-4">
                    No matches yet. Waiting for host to start rounds.
                  </p>
                  {allRefereeTournaments.map((tournament, index) => (
                    <Link
                      key={tournament.id}
                      href={`/tournaments/${tournament.id}`}
                      className="cursor-pointer"
                    >
                      <TournamentCard tournament={tournament} index={index} />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 border-2 border-dashed border-border/50 rounded-2xl bg-muted/5">
                  <div className="bg-muted/30 p-4 rounded-full">
                    <Zap className="size-8 text-muted-foreground/30" />
                  </div>
                  <p className="text-muted-foreground text-sm font-medium">
                    Not an official yet.
                  </p>
                  <p className="text-muted-foreground/60 text-xs">
                    Ask a host to add you as a referee.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollablePageContent>
    </ScrollablePage>
  );
}
