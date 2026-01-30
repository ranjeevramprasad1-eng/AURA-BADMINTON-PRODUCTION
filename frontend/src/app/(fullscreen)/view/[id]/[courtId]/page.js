"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { courtsApi, tournamentsApi } from "@/lib/api";
import { useActiveCourtMatch } from "@/hooks/useCourtMatches";
import { useTournamentEngine } from "@/hooks/useTournamentEngine";
import { useDisplayTimer } from "@/hooks/useDisplayTimer";
import { Loader2 } from "lucide-react";
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
  const [scoreAnimation, setScoreAnimation] = useState({
    teamA: false,
    teamB: false,
  });
  const prevScoreA = useRef(0);
  const prevScoreB = useRef(0);
  const wsConnectionRef = useRef(null);

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

    // Update match ended state
    if (matchDetails.status === "completed") {
      setMatchEnded(true);
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
  }, [matchDetails, activeMatch?.id, tournamentMatchData]);

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

  // No active match state
  if (!activeMatch && !isLoading) {
    return (
      <ScrollablePage className="h-dvh bg-background">
        <ScrollablePageHeader className="relative bg-transparent pointer-events-none">
          <header className="absolute top-0 left-0 right-0 z-20 pointer-events-auto pt-safe-top">
            <div className="flex items-center justify-between px-4 py-3 bg-linear-to-b from-black/50 to-transparent">
              <button
                onClick={() => router.back()}
                className="rounded-full bg-background/20 backdrop-blur-md text-white hover:bg-background/40 hover:text-white p-2"
              >
                ←
              </button>
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

  // Extract match data
  const match = matchDetails || activeMatch;

  // Use tournament match data for players with AURA, fallback to matchDetails teams
  const players = tournamentMatchData?.players || [];
  const teams = matchDetails?.teams || [];

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

  return (
    <ScrollablePage className="h-dvh bg-[#5b584f] bg-linear-to-t from-background/10 via-background/0 to-transparent">
      <ScrollablePageHeader className="relative bg-transparent pointer-events-none ">
        <ViewCourtHeader
          tournamentName={match?.tournaments?.name}
          courtNumber={match?.courts?.court_number || courtId}
          status={status}
          statusText={statusText}
          round={match?.round}
          onBack={() => router.back()}
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
        <div className={`w-full h-full transition-all duration-500 ease-in-out ${showStandings ? 'grid grid-cols-2 gap-4' : 'flex items-center justify-center'
          }`}>
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

/**
 * ScoreSection Component
 * Displays the score with conditional layout (matching match page UI)
 */
function ScoreSection({ showStandings, teamA, teamB, scoreA, scoreB, scoreAnimation, matchEnded, match }) {
  return (
    <div className={cn(showStandings ? '' : 'w-full h-full', "transition-all duration-500 flex items-center justify-center")}>
      <div className="size-full relative flex flex-col items-center justify-center">

        {/* Players Grid - Same as match page */}
        <div className="w-full px-8 py-4 pb-0">
          <div className="grid grid-cols-3 gap-8 items-center">
            {/* Team A - Left Column */}
            <motion.div
              className="flex flex-col items-center gap-4"
              animate={{
                scale: scoreAnimation.teamA ? 1.05 : 1,
              }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {teamA.map((player, index) => (
                <motion.div
                  key={player.id || index}
                  className="flex flex-col items-center"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.5,
                    delay: index * 0.1,
                    ease: "easeOut",
                  }}
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="relative mb-4">
                    <motion.div
                      className="size-32 bg-linear-to-br from-brand-blue to-blue-600/50 rounded-full flex items-center justify-center text-blue-100/90 font-black text-3xl border-4 border-background/10 shadow-lg"
                      whileHover={{
                        scale: 1.1,
                        boxShadow: "0 10px 25px rgba(59, 130, 246, 0.4)",
                      }}
                      transition={{ duration: 0.2 }}
                    >
                      {player.aura ? player.aura.toFixed(1) : "N/A"}
                    </motion.div>
                  </div>
                  <motion.p
                    className="text-xl font-bold text-center truncate max-w-[120px] md:max-w-[160px] lg:max-w-[200px] text-white/90"
                    whileHover={{ color: "#3b82f6" }}
                    transition={{ duration: 0.2 }}
                  >
                    {player.name || player.username || "Player"}
                  </motion.p>
                </motion.div>
              ))}
            </motion.div>

            {/* Score - Middle Column */}
            <div className="flex flex-col items-center mt-8">
              <motion.div
                className="text-center font-black text-8xl md:text-9xl lg:text-[12rem] xl:text-[16rem] tracking-tighter mb-2"
                key={`${scoreA}-${scoreB}`}
                initial={{ scale: 1 }}
                animate={{
                  scale: scoreAnimation.teamA || scoreAnimation.teamB ? 1.2 : 1,
                }}
                transition={{
                  duration: 0.3,
                  ease: "easeOut",
                }}
              >
                <span className={scoreA > scoreB ? "text-white" : "text-white/70"}>{scoreA}</span>
                <span className="text-white/30 mx-12">-</span>
                <span className={scoreB > scoreA ? "text-white" : "text-white/30"}>{scoreB}</span>
              </motion.div>

              <div className="flex items-center gap-3 mt-4">
                <div className={`size-3 md:size-4 rounded-full ${scoreA > scoreB ? "bg-linear-to-br from-brand-blue to-blue-600/50" : "bg-linear-to-br from-brand-muted to-blue-600/50"}`} />
                <span className="text-5xl font-bold uppercase tracking-widest text-white/30">VS</span>
                <div className={`size-3 md:size-4 rounded-full ${scoreB > scoreA ? "bg-linear-to-br from-brand-green/50 via-green-600 to-green-600/50" : "bg-linear-to-br from-brand-muted to-green-600/50"}`} />
              </div>

              {/* Match Completed Indicator */}
              {matchEnded && (
                <motion.div
                  className="mt-4 flex items-center justify-center"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                >
                  <div className="px-4 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full backdrop-blur-sm">
                    <div className="text-xs font-black text-green-600 text-center uppercase tracking-wide flex items-center gap-1.5">
                      <span>🏆</span> Match Completed
                    </div>
                  </div>
                </motion.div>
              )}
              <MatchInfoFooter match={match} />
            </div>

            {/* Team B - Right Column */}
            <motion.div
              className="flex flex-col items-center gap-4"
              animate={{
                scale: scoreAnimation.teamB ? 1.05 : 1,
              }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {teamB.map((player, index) => (
                <motion.div
                  key={player.id || index}
                  className="flex flex-col items-center"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.5,
                    delay: index * 0.1,
                    ease: "easeOut",
                  }}
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="relative mb-4">
                    <motion.div
                      className="size-32 bg-linear-to-br from-brand-green/50 via-green-600 to-green-600/50 rounded-full flex items-center justify-center text-green-100/90 font-black text-3xl border-4 border-background/40 shadow-lg"
                      whileHover={{
                        scale: 1.1,
                        boxShadow: "0 10px 25px rgba(16, 185, 129, 0.4)",
                      }}
                      transition={{ duration: 0.2 }}
                    >
                      {player.aura ? player.aura.toFixed(1) : "N/A"}
                    </motion.div>
                  </div>
                  <motion.p
                    className="text-2xl font-bold text-center truncate max-w-[120px] md:max-w-[160px] lg:max-w-[200px] text-white/90"
                    whileHover={{ color: "#10b981" }}
                    transition={{ duration: 0.2 }}
                  >
                    {player.name || player.username || "Player"}
                  </motion.p>
                </motion.div>
              ))}
            </motion.div>
          </div>
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
    <div className="mt-4 text-center space-y-3">
      {match?.start_time && (
        <div className="bg-background/20 rounded-xl p-3 border border-white/20 inline-block">
          <p className="text-sm md:text-lg text-white/70 font-medium">
            Started: {new Date(match.start_time).toLocaleTimeString()}
          </p>
        </div>
      )}
      {!match?.refree_id && (
        <p className="text-xs md:text-sm text-white/70 uppercase tracking-wide font-medium">
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
