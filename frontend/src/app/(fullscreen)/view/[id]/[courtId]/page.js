"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { courtsApi, tournamentsApi } from "@/lib/api";
import { useActiveCourtMatch } from "@/hooks/useCourtMatches";
import { useTournamentEngine } from "@/hooks/useTournamentEngine";
import { useDisplayTimer } from "@/hooks/useDisplayTimer";
import { ArrowLeft, Loader2, Zap } from "lucide-react";
import {
  ScrollablePage,
  ScrollablePageHeader,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";
import { ViewCourtHeader } from "@/components/fullscreen/ViewCourtHeader";
import { StandingsDisplay } from "@/components/fullscreen/StandingsDisplay";
import { DISPLAY_TIMER_CONFIG } from "@/constants/displayTimer";
import { getGroupKeys } from "@/lib/utils/tournament";
import { createWebSocketConnection } from "@/lib/websocket";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * ViewCourtPage Component
 * Fullscreen view for displaying court match scores and standings
 * 
 * Features:
 * - Score display with automatic cycling
 * - Standings display with group rotation
 * - Smooth animations using Framer Motion
 * - Composite Pattern for scalable component structure
 */
export default function ViewCourtPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tournamentId = params.id;
  const courtId = params.courtId;

  // Fetch court details
  const { data: courtData } = useQuery({
    queryKey: ["court", courtId],
    queryFn: async () => {
      const response = await courtsApi.getById(courtId);
      return response.data?.data;
    },
    enabled: !!courtId,
  });

  // Fetch active match for this court with live updates via websocket
  const {
    isLoading,
    activeMatch,
    matchDetails,
  } = useActiveCourtMatch(tournamentId, courtId, {
    liveUpdates: true,
  });

  // State for score display (similar to match page)
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [matchEnded, setMatchEnded] = useState(false);
  const [winnerTeamId, setWinnerTeamId] = useState(null);
  /** When match ends, keep showing it (with winner) until next match or timeout */
  const [completedMatchSnapshot, setCompletedMatchSnapshot] = useState(null);
  const [scoreAnimation, setScoreAnimation] = useState({
    teamA: false,
    teamB: false,
  });
  const prevScoreA = useRef(0);
  const prevScoreB = useRef(0);
  const wsConnectionRef = useRef(null);
  const tournamentWsRef = useRef(null);

  // Tournament WebSocket: when next match is assigned to this court (or match list changes), refetch so screen updates
  useEffect(() => {
    if (!tournamentId) return;
    const ws = createWebSocketConnection(`/ws/tournament/${tournamentId}/updates`, {
      onOpen: () => {
        console.log("🔌 [Fullscreen] Tournament updates WebSocket connected");
      },
      onClose: () => {
        console.log("🔌 [Fullscreen] Tournament updates WebSocket disconnected");
      },
      onError: (err) => {
        console.error("❌ [Fullscreen] Tournament updates WebSocket error:", err);
      },
      onMessage: (data) => {
        const triggers = [
          "standings_update",
          "match_start",
          "match_complete",
          "match_update",
          "court_match_update",
        ];
        if (triggers.includes(data.type)) {
          queryClient.invalidateQueries({ queryKey: ["matches", "court", tournamentId, courtId] });
        }
      },
      reconnect: true,
    });
    tournamentWsRef.current = ws;
    return () => {
      if (tournamentWsRef.current?.close) tournamentWsRef.current.close();
      tournamentWsRef.current = null;
    };
  }, [tournamentId, courtId, queryClient]);

  // Fetch match details with player AURA scores from tournament API
  const { data: tournamentMatchData } = useQuery({
    queryKey: ['tournament-match', tournamentId, matchDetails?.round, activeMatch?.id],
    queryFn: async () => {
      if (!tournamentId || !matchDetails?.round || !activeMatch?.id) return null;
      try {
        const response = await tournamentsApi.getMatch(tournamentId, matchDetails.round, activeMatch.id);
        return response.data.data;
      } catch (error) {
        console.error('Failed to fetch tournament match data:', error);
        return null;
      }
    },
    enabled: !!tournamentId && !!matchDetails?.round && !!activeMatch?.id,
  });

  // Change state only when next match starts (or on reload). Keep showing completed match + winner until then.
  const matchIdRef = useRef(matchDetails?.id ?? activeMatch?.id);
  useEffect(() => {
    const nextMatchId = activeMatch?.id;
    // Only clear completed state when a new match has started (different from the one in snapshot)
    if (nextMatchId != null && nextMatchId !== completedMatchSnapshot?.match?.id) {
      matchIdRef.current = nextMatchId;
      setMatchEnded(false);
      setWinnerTeamId(null);
      setCompletedMatchSnapshot(null);
    }
  }, [activeMatch?.id, completedMatchSnapshot?.match?.id]);

  // Initialize score from match details and connect to WebSocket
  useEffect(() => {
    if (!matchDetails) return;

    // Initialize score from latest DB score
    const latestScore = matchDetails.scores && matchDetails.scores.length > 0
      ? matchDetails.scores[matchDetails.scores.length - 1]
      : null;

    if (latestScore) {
      const teamA = latestScore.team_a_score || 0;
      const teamB = latestScore.team_b_score || 0;
      setScoreA(teamA);
      setScoreB(teamB);

    }

    // Update match ended state and winner
    if (matchDetails.status === "completed") {
      setMatchEnded(true);
      if (matchDetails.winner_team_id != null) {
        setWinnerTeamId(matchDetails.winner_team_id);
      }
    }

    // Connect to WebSocket for real-time updates
    const matchId = matchDetails.id || activeMatch?.id;
    if (matchId) {
      const initialTeamA = latestScore?.team_a_score || 0;
      const initialTeamB = latestScore?.team_b_score || 0;

      const ws = createWebSocketConnection(`/ws/match/${matchId}/score`, {
        onOpen: (event, wsInstance) => {
          console.log("🔌 [Fullscreen] WebSocket connected for match", matchId);
          if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
            wsInstance.send(
              JSON.stringify({
                type: "init",
                teamA: initialTeamA,
                teamB: initialTeamB,
              })
            );
          }
        },
        onClose: () => {
          console.log("🔌 [Fullscreen] WebSocket disconnected for match", matchId);
        },
        onError: (error) => {
          console.error("❌ [Fullscreen] WebSocket error:", error);
        },
        onMessage: (data) => {
          if (data.type === "score_update") {
            setScoreA(data.teamA);
            setScoreB(data.teamB);
          } else if (data.type === "match_end") {
            setMatchEnded(true);
            if (data.winnerTeamId != null) setWinnerTeamId(data.winnerTeamId);
            // Keep showing this match (with winner) until next match loads
            setCompletedMatchSnapshot({
              matchDetails: { ...matchDetails, status: "completed", winner_team_id: data.winnerTeamId ?? matchDetails?.winner_team_id },
              match: { ...(matchDetails || activeMatch), status: "completed", winner_team_id: data.winnerTeamId ?? matchDetails?.winner_team_id },
            });
            // Court match list refetch is driven by tournament WebSocket (standings_update / match_complete etc.)
          }
        },
        reconnect: true,
      });

      wsConnectionRef.current = ws;

      return () => {
        if (wsConnectionRef.current) {
          wsConnectionRef.current.close();
        }
      };
    }
  }, [matchDetails, activeMatch?.id, tournamentMatchData, queryClient, tournamentId, courtId]);

  // Detect score changes and trigger animations
  useEffect(() => {
    if (scoreA !== prevScoreA.current && prevScoreA.current !== 0) {
      setScoreAnimation((prev) => ({ ...prev, teamA: true }));
      setTimeout(
        () => setScoreAnimation((prev) => ({ ...prev, teamA: false })),
        600
      );
    }
    if (scoreB !== prevScoreB.current && prevScoreB.current !== 0) {
      setScoreAnimation((prev) => ({ ...prev, teamB: true }));
      setTimeout(
        () => setScoreAnimation((prev) => ({ ...prev, teamB: false })),
        600
      );
    }
    prevScoreA.current = scoreA;
    prevScoreB.current = scoreB;
  }, [scoreA, scoreB]);

  // Fetch tournament engine data for standings
  const {
    standings: engineStandings,
    matches: engineMatches,
    isLoading: engineLoading,
  } = useTournamentEngine(tournamentId);

  // Get group keys from standings
  const groupKeys = useMemo(() => getGroupKeys(engineStandings), [engineStandings]);

  // Display timer hook - stopped by default
  const {
    showStandings,
    currentGroupIndex,
    progressPercentage,
    isPaused,
    isStopped,
    pause,
    resume,
    stop,
    reset,
  } = useDisplayTimer({
    scoreDuration: DISPLAY_TIMER_CONFIG.SCORE_DURATION,
    groupDuration: DISPLAY_TIMER_CONFIG.GROUP_DURATION,
    standingsDuration: DISPLAY_TIMER_CONFIG.STANDINGS_DURATION,
    groupCount: groupKeys.length,
    initialStopped: true, // Stop animation by default
  });

  // Get current group key to display
  const currentGroupKey = useMemo(() => {
    if (currentGroupIndex === null || groupKeys.length === 0) return null;
    return groupKeys[currentGroupIndex];
  }, [currentGroupIndex, groupKeys]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="size-16 animate-spin text-primary mx-auto mb-4" />
          <p className="text-2xl text-foreground/80">Loading match...</p>
        </div>
      </div>
    );
  }

  // No active match: show "No Active Match" only if we're not showing a completed match (with winner)
  const showingCompletedMatch = !activeMatch && !isLoading && completedMatchSnapshot != null;
  if (!activeMatch && !isLoading && !showingCompletedMatch) {
    return (
      <ScrollablePage className="h-dvh bg-background">
        <ScrollablePageHeader className="relative bg-transparent pointer-events-none">
          <header className="absolute top-0 left-0 right-0 z-20 pointer-events-auto pt-safe-top">
            <div className="flex items-center justify-between px-4 py-3 bg-linear-to-b from-black/50 to-transparent">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="rounded-full text-white hover:bg-white/10 hover:text-background"
              >
                <ArrowLeft className="size-5" />
              </Button>
            </div>
          </header>
        </ScrollablePageHeader>
        <ScrollablePageContent className="flex items-center justify-center">
          <div className="text-center px-8">
            <h1 className="text-6xl font-black italic tracking-tighter text-foreground mb-4">
              No Active Match
            </h1>
            <p className="text-3xl text-muted-foreground">
              Court {courtData?.court_number || courtId}
            </p>
            <p className="text-2xl text-muted-foreground/70 mt-8">
              Waiting for match to start...
            </p>
          </div>
        </ScrollablePageContent>
      </ScrollablePage>
    );
  }

  // Extract match data: use completed snapshot when showing finished match with winner
  const match = showingCompletedMatch ? completedMatchSnapshot.match : (matchDetails || activeMatch);
  const effectiveMatchDetails = showingCompletedMatch ? completedMatchSnapshot.matchDetails : matchDetails;
  // Use tournament match data for players with AURA, fallback to matchDetails teams
  const players = tournamentMatchData?.players || [];
  const teams = effectiveMatchDetails?.teams ?? matchDetails?.teams ?? [];

  // Group players into teams (from tournament API) or fallback to matchDetails teams
  const teamA = useMemo(() => {
    if (players && players.length > 0) {
      return players.filter((p) => p.team === "A") || [];
    }
    // Fallback to matchDetails teams
    return teams[0]?.members?.map((member) => ({
      id: member.id,
      name: member.username || `Player ${member.id}`,
      username: member.username || `Player ${member.id}`,
      photo_url: member.photo_url,
      aura: null,
      team: "A",
    })) || [];
  }, [players, teams]);

  const teamB = useMemo(() => {
    if (players && players.length > 0) {
      return players.filter((p) => p.team === "B") || [];
    }
    // Fallback to matchDetails teams
    return teams[1]?.members?.map((member) => ({
      id: member.id,
      name: member.username || `Player ${member.id}`,
      username: member.username || `Player ${member.id}`,
      photo_url: member.photo_url,
      aura: null,
      team: "B",
    })) || [];
  }, [players, teams]);

  // Match status
  const status = match?.status || "pending";
  const statusText = {
    pending: "Not Started",
    in_progress: "Live",
    completed: "Completed",
    cancelled: "Cancelled",
  }[status] || status;

  // Winner: from WebSocket (immediate) or match data
  const effectiveWinnerTeamId = winnerTeamId ?? match?.winner_team_id ?? null;
  const teamAId = teams[0]?.id ?? null;
  const teamBId = teams[1]?.id ?? null;

  return (
    <ScrollablePage className="h-dvh bg-[#5b584f] bg-linear-to-t from-background/10 via-background/0 to-transparent">
      <ScrollablePageHeader className="relative bg-transparent pointer-events-none ">
        <ViewCourtHeader
          tournamentName={match?.tournaments?.name}
          courtNumber={match?.courts?.court_number || courtId}
          status={status}
          statusText={statusText}
          round={match?.round}
          onBack={() => router.push(`/tournaments/${tournamentId}/stats`)}
          progressPercentage={progressPercentage}
          isPaused={isPaused}
          isStopped={isStopped}
          onPause={pause}
          onResume={resume}
          onStop={stop}
          onReset={reset}
        />
      </ScrollablePageHeader>

      <ScrollablePageContent className="flex flex-col items-center justify-center p-0">
        {/* Split Screen Layout */}
        <div className={cn("w-full h-full transition-all duration-500 ease-in-out",
          showStandings ? 'grid grid-cols-2 gap-4' : 'flex items-center justify-center'
        )}>
          {/* Score Display - Full Width */}
          <ScoreSection
            showStandings={showStandings}
            teamA={teamA}
            teamB={teamB}
            scoreA={scoreA}
            scoreB={scoreB}
            scoreAnimation={scoreAnimation}
            matchEnded={matchEnded}
            match={match}
            winnerTeamId={effectiveWinnerTeamId}
            teamAId={teamAId}
            teamBId={teamBId}
          />

          {/* Standings Display - Right Side */}
          <StandingsSection
            showStandings={showStandings}
            currentGroupKey={currentGroupKey}
            engineLoading={engineLoading}
            engineStandings={engineStandings}
            engineMatches={engineMatches}
          />
        </div>
      </ScrollablePageContent>
    </ScrollablePage>
  );
}

function PlayerName({ player, className }) {
  return (
    <motion.p
      className={cn("text-xl sm:text-7xl capitalize font-black text-center truncate max-w-full text-white/90 leading-tight", className)}
    >
      {player.name || player.username || "Player"}
    </motion.p>
  );
}

function TeamSection({ children, index, className }) {
  return (
    <motion.div
      key={index}
      className={cn("flex items-center w-full", className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.1,
        ease: "easeOut",
      }}
    >
      {children}
    </motion.div>
  );
}

function PlayerAura({ player, className }) {
  return (
    <motion.div
      className={cn("size-24 rounded-full flex items-center justify-center text-blue-100/90 font-black text-2xl border-4 border-background/10 shadow-lg", className)}
      transition={{ duration: 0.2 }}
    >
      {player.aura ? player.aura.toFixed(1) : "N/A"}
    </motion.div>
  );
}

function TeamAuraAverage({ team, className, fill = "white" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}

      className={cn("font-black text-2xl md:text-3xl tracking-tighter flex items-center gap-2 px-4 py-1 bg-background/20 rounded-full border border-white/20 w-fit", className)}>
      <Zap className={cn("size-6 fill-white/90 text-white/90", fill === "blue" ? "fill-blue-400/90 text-blue-400/90" : "fill-green-400/90 text-green-400/90")} />
      <span className={cn("text-white/90 font-black", className)}>
        {((team.reduce((acc, player) => acc + (player.aura || 0), 0) / team.length) || 0).toFixed(2)}
      </span>
    </motion.div>
  );
}

/**
 * ScoreSection Component
 * Displays the score with conditional layout (matching match page UI)
 */
function ScoreSection({ showStandings, teamA, teamB, scoreA, scoreB, scoreAnimation, matchEnded, match, winnerTeamId, teamAId, teamBId }) {
  const isTeamAWinner = winnerTeamId != null && teamAId != null && String(winnerTeamId) === String(teamAId);
  const isTeamBWinner = winnerTeamId != null && teamBId != null && String(winnerTeamId) === String(teamBId);
  const winningTeam = isTeamAWinner ? teamA : isTeamBWinner ? teamB : null;
  const winnerLabel = winningTeam?.length
    ? winningTeam.map((p) => p.name || p.username || "Player").join(" & ")
    : null;

  return (
    <div className={cn(showStandings ? '' : 'w-full h-full', "transition-all duration-500 flex items-center justify-center")}>
      <div className="size-full relative flex flex-col items-center justify-center">

        {/* Players Grid - Same as match page */}
        <div className="w-full px-8">
          <div className="grid grid-cols-3 gap-8 items-center">
            <div className="flex flex-col col-span-2 items-center w-full gap-8">
              {/* Team A  */}
              <div className={cn("flex flex-col w-full transition-all duration-300", matchEnded && isTeamAWinner && "ring-4 ring-amber-400/80 rounded-2xl bg-amber-500/10 p-4")}>
                <TeamAuraAverage team={teamA} fill="blue" />
                {teamA.map((player, index) => (
                  <TeamSection key={index} index={index}>
                    <PlayerName player={player} className="text-blue-400/90" />
                  </TeamSection>
                ))}
              </div>
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl font-black tracking-tight text-white/20">VS</span>

              {/* Team B  */}
              <div className={cn("flex flex-col w-full transition-all duration-300", matchEnded && isTeamBWinner && "ring-4 ring-amber-400/80 rounded-2xl bg-amber-500/10 p-4")}>
                <TeamAuraAverage team={teamB} fill="green" />
                {teamB.map((player, index) => (
                  <TeamSection key={index} index={index}>
                    <PlayerName player={player} className="text-green-400/90" />
                  </TeamSection>
                ))}
              </div>
            </div>

            {/* Score - Middle Column */}
            <div className="flex flex-col items-center mt-12">
              <div
                className="flex flex-col gap-8 text-center font-black text-8xl md:text-[16rem] tracking-tighter"
                key={`${scoreA}-${scoreB}`}
              >
                <motion.span className={scoreA > scoreB ? "text-white" : "text-white/70"} animate={{ scale: scoreAnimation.teamA ? 1.2 : 1 }} transition={{ duration: 0.3, ease: "easeOut" }}>{scoreA}</motion.span>
                <motion.span className={scoreB > scoreA ? "text-white" : "text-white/30"} animate={{ scale: scoreAnimation.teamB ? 1.2 : 1 }} transition={{ duration: 0.3, ease: "easeOut" }}>{scoreB}</motion.span>
              </div>

              {/* Match Completed + Winner */}
              {matchEnded && (
                <motion.div
                  className="mt-6 flex flex-col items-center justify-center gap-3"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                >
                  <div className="px-4 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full backdrop-blur-sm">
                    <div className="text-xs font-black text-green-600 text-center uppercase tracking-wide flex items-center gap-1.5">
                      <span>🏆</span> Match Completed
                    </div>
                  </div>
                  {winnerLabel && (
                    <div className="px-6 py-3 bg-amber-500/20 border-2 border-amber-400/50 rounded-xl backdrop-blur-sm">
                      <p className="text-xs font-bold text-amber-200/90 uppercase tracking-wider mb-1">Winner</p>
                      <p className="text-xl md:text-2xl font-black text-white text-center tracking-tight">
                        {winnerLabel}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </div>
          <MatchInfoFooter match={match} />
        </div>

      </div>
    </div>
  );
}

/**
 * MatchInfoFooter Component
 * Displays additional match information
 */
function MatchInfoFooter({ match }) {
  return (
    <div className="absolute bottom-4 right-4 text-center space-y-3">
      {match?.start_time && (
        <div className="bg-background/20 rounded-full px-2 py-1 border border-white/20 inline-block">
          <p className="text-xs md:text-base text-white/70 font-medium">
            Started: {new Date(match.start_time).toLocaleTimeString()}
          </p>
        </div>
      )}
      {!match?.refree_id && (
        <p className="text-xs md:text-sm text-white/70 uppercase tracking-wide font-medium px-1.5 py-0.5">
          No Referee Assigned yet
        </p>
      )}
    </div>
  );
}

/**
 * StandingsSection Component
 * Displays standings with animations
 */
function StandingsSection({
  showStandings,
  currentGroupKey,
  engineLoading,
  engineStandings,
  engineMatches,
}) {
  return (
    <AnimatePresence mode="wait">
      {showStandings && (
        <motion.div
          key="standings"
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 35,
            mass: 0.8,
          }}
          className="h-full overflow-hidden"
        >
          {engineLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentGroupKey || 'all'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="h-full"
              >
                <StandingsDisplay
                  standings={engineStandings}
                  matches={engineMatches}
                  currentGroupKey={currentGroupKey}
                />
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
