"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { useMatch } from "@/hooks/useMatch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  MoreVertical,
} from "lucide-react";
import { createWebSocketConnection } from "@/lib/websocket";
import { toast } from "sonner";
import {
  ScrollablePage,
  ScrollablePageHeader,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

export default function MatchDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [winRate, setWinRate] = useState(50);
  const [matchEnded, setMatchEnded] = useState(false);
  const [winnerTeamId, setWinnerTeamId] = useState(null);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [scoreAnimation, setScoreAnimation] = useState({
    teamA: false,
    teamB: false,
  });
  const prevScoreA = useRef(0);
  const prevScoreB = useRef(0);
  const wsConnectionRef = useRef(null);

  const { data: matchData, isLoading } = useMatch(
    params.id,
    params.round,
    params.match
  );

  // Update match ended state when matchData changes
  useEffect(() => {
    if (matchData?.status === "completed") {
      setMatchEnded(true);
      setWinnerTeamId(matchData?.winner_team_id || null);
    }
  }, [matchData?.status, matchData?.winner_team_id]);

  // Initialize score from DB and connect to WebSocket
  useEffect(() => {
    if (!matchData) return;

    // Initialize score from latest DB score
    const latestScore =
      matchData.scores && matchData.scores.length > 0
        ? matchData.scores[matchData.scores.length - 1]
        : null;

    if (latestScore) {
      const teamA = latestScore.team_a || 0;
      const teamB = latestScore.team_b || 0;
      setScoreA(teamA);
      setScoreB(teamB);

      // Initialize score history from DB scores
      if (matchData.scores && matchData.scores.length > 0) {
        const sortedScores = [...matchData.scores].sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at)
        );
        setScoreHistory(
          sortedScores.map((score, index) => ({
            rally: index,
            teamA: score.team_a || 0,
            teamB: score.team_b || 0,
          }))
        );
      } else {
        setScoreHistory([{ rally: 0, teamA: 0, teamB: 0 }]);
      }

      // Use win_prob_A from backend if available, otherwise calculate fallback
      if (matchData.win_prob_A !== null && matchData.win_prob_A !== undefined) {
        setWinRate(matchData.win_prob_A);
      } else {
        // Fallback: calculate from score ratio
        const total = teamA + teamB;
        const initialWinRate =
          total > 0 ? Math.round((teamA / total) * 100) : 50;
        setWinRate(initialWinRate);
      }
    } else {
      // No scores yet, use win_prob_A if available or default to 50
      if (matchData.win_prob_A !== null && matchData.win_prob_A !== undefined) {
        setWinRate(matchData.win_prob_A);
      } else {
        setWinRate(50);
      }
      setScoreHistory([{ rally: 0, teamA: 0, teamB: 0 }]);
    }

    // Connect to WebSocket for real-time updates
    const matchId = matchData.match_id;
    if (matchId) {
      // Get initial score from DB data
      const initialTeamA = latestScore?.team_a || 0;
      const initialTeamB = latestScore?.team_b || 0;

      const ws = createWebSocketConnection(`/ws/match/${matchId}/score`, {
        onOpen: (event, wsInstance) => {
          console.log("🔌 [Viewer] WebSocket connected for match", matchId);
          // Send initial score data to server
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
          console.log("🔌 [Viewer] WebSocket disconnected for match", matchId);
        },
        onError: (error) => {
          console.error("❌ [Viewer] WebSocket error:", error);
        },
        onMessage: (data) => {
          console.log("📩 [Viewer] WebSocket message received:", data);
          if (data.type === "score_update") {
            setScoreA(data.teamA);
            setScoreB(data.teamB);
            // Update score history for real-time chart updates
            setScoreHistory((prev) => {
              const newRally = prev.length;
              return [
                ...prev,
                {
                  rally: newRally,
                  teamA: data.teamA,
                  teamB: data.teamB,
                },
              ];
            });
            // winRate from WebSocket is the win probability percentage
            if (data.winRate !== undefined && data.winRate !== null) {
              setWinRate(data.winRate);
            }
          } else if (data.type === "match_end") {
            setMatchEnded(true);
            setWinnerTeamId(data.winnerTeamId || null);
            toast.success("Match completed!");
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
  }, [matchData]);

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


  // Prepare chart data from scores history (combines DB scores and real-time updates)
  // This hook must be called before any conditional returns
  const chartData = useMemo(() => {
    if (scoreHistory.length > 0) {
      return scoreHistory;
    }
    // Fallback to DB scores if no real-time history yet
    if (!matchData?.scores || matchData.scores.length === 0) {
      return [{ rally: 0, teamA: 0, teamB: 0 }];
    }

    // Sort scores by created_at to ensure chronological order
    const sortedScores = [...matchData.scores].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    // Create data points for the chart
    // Each score update represents a rally/point
    return sortedScores.map((score, index) => ({
      rally: index,
      teamA: score.team_a || 0,
      teamB: score.team_b || 0,
    }));
  }, [scoreHistory, matchData?.scores]);

  if (isLoading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  if (!matchData) {
    return <div className="p-4 text-center">Match not found</div>;
  }

  const { players, round, court, match_format, tournament_name } = matchData;

  // Group players into teams
  const teamA = players?.filter((p) => p.team === "A") || [];
  const teamB = players?.filter((p) => p.team === "B") || [];

  // Get team IDs to determine winner
  const teamAId = teamA.length > 0 ? teamA[0]?.team_id : null;
  const teamBId = teamB.length > 0 ? teamB[0]?.team_id : null;
  const winnerTeamIdFromData = matchData?.winner_team_id || winnerTeamId;
  const isTeamAWinner =
    winnerTeamIdFromData &&
    teamAId &&
    String(winnerTeamIdFromData) === String(teamAId);
  const isTeamBWinner =
    winnerTeamIdFromData &&
    teamBId &&
    String(winnerTeamIdFromData) === String(teamBId);

  // Use WebSocket score state
  const currentScore = `${scoreA} - ${scoreB}`;

  // Calculate max values for axes
  const maxRally = Math.max(chartData.length - 1, 0);
  const maxScore = Math.max(
    ...chartData.map((d) => Math.max(d.teamA, d.teamB)),
    25
  );

  // Round up to nearest 5 for Y-axis
  const yAxisMax = Math.ceil(maxScore / 5) * 5;
  const xAxisMax = Math.max(Math.ceil(maxRally / 5) * 5, 5);

  return (
    <ScrollablePage className="bg-background">
      {/* Header */}
      <ScrollablePageHeader className="pb-0 bg-transparent">
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
          <div className="flex items-center justify-between px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="size-5" />
            </Button>
            <div className="flex flex-col items-center">
              <h1 className="text-sm font-black uppercase tracking-wider">{tournament_name}</h1>
              <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
                <span>Court {court}</span>
                <span className="size-1 rounded-full bg-border" />
                <span>Round {round}</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="invisible">
              <MoreVertical className="size-5" />
            </Button>
          </div>
        </header>
      </ScrollablePageHeader>

      <ScrollablePageContent className="pb-24 pt-4 relative">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 inset-x-0 h-48 bg-linear-to-b from-brand-blue/10 to-transparent skew-y-3 origin-top-left scale-110 pointer-events-none -z-10" />
        <div className="absolute top-0 right-0 size-64 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none -z-10" />

        {/* Players Grid */}
        <div className="p-4">
          <div className="grid grid-cols-3 gap-4 items-center">
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
                  key={player.id}
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
                  <div className="relative mb-2">
                    <motion.div
                      className="size-16 bg-linear-to-br from-brand-blue to-blue-600 rounded-full flex items-center justify-center text-white font-black text-sm border-4 border-background shadow-lg"
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
                    className="text-xs font-bold text-center truncate max-w-[80px]"
                    whileHover={{ color: "#3b82f6" }}
                    transition={{ duration: 0.2 }}
                  >
                    {player.name || player.username || "Player"}
                  </motion.p>
                </motion.div>
              ))}
            </motion.div>

            {/* Score - Middle Column */}
            <div className="flex flex-col items-center">
              <motion.div
                className="text-center font-black text-5xl tracking-tighter mb-1"
                key={currentScore}
                initial={{ scale: 1 }}
                animate={{
                  scale: scoreAnimation.teamA || scoreAnimation.teamB ? 1.2 : 1,
                }}
                transition={{
                  duration: 0.3,
                  ease: "easeOut",
                }}
              >
                <span className={scoreA > scoreB ? "text-foreground" : "text-muted-foreground"}>{scoreA}</span>
                <span className="text-muted-foreground/30 mx-1">-</span>
                <span className={scoreB > scoreA ? "text-foreground" : "text-muted-foreground"}>{scoreB}</span>
              </motion.div>

              <div className="flex items-center gap-2 mt-2">
                <div className={`size-2 rounded-full ${scoreA > scoreB ? "bg-brand-blue" : "bg-muted"}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">VS</span>
                <div className={`size-2 rounded-full ${scoreB > scoreA ? "bg-brand-green" : "bg-muted"}`} />
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
                  key={player.id}
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
                  <div className="relative mb-2">
                    <motion.div
                      className="size-16 bg-linear-to-br from-brand-green to-emerald-600 rounded-full flex items-center justify-center text-white font-black text-sm border-4 border-background shadow-lg"
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
                    className="text-xs font-bold text-center truncate max-w-[80px]"
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

        {/* Win Probability - Live from WebSocket */}
        <div className="px-6 py-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Win Probability</span>
            <div className="flex gap-4 text-xs font-bold">
              <span className="text-brand-blue">{winRate.toFixed(0)}%</span>
              <span className="text-brand-green">{(100 - winRate).toFixed(0)}%</span>
            </div>
          </div>

          <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
            <motion.div
              className="h-full bg-brand-blue"
              initial={{ width: "50%" }}
              animate={{ width: `${winRate}%` }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
            <motion.div
              className="h-full bg-brand-green"
              initial={{ width: "50%" }}
              animate={{ width: `${100 - winRate}%` }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
          </div>
        </div>

        {/* Graph Section */}
        <div className="px-4 pb-8">
          <Card className="p-4 border-border/50 shadow-sm bg-card/50 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Momentum</h3>
              <div className="flex gap-2">
                <div className="flex items-center gap-1">
                  <div className="size-1.5 rounded-full bg-brand-blue" />
                  <span className="text-[10px] font-medium text-muted-foreground">Team A</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="size-1.5 rounded-full bg-brand-green" />
                  <span className="text-[10px] font-medium text-muted-foreground">Team B</span>
                </div>
              </div>
            </div>
            <div className="h-48 w-full">
              <ChartContainer
                config={{
                  teamA: {
                    label: "Team A",
                    color: "#3b82f6",
                  },
                  teamB: {
                    label: "Team B",
                    color: "#10b981",
                  },
                }}
                className="size-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      opacity={0.4}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="rally"
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, xAxisMax]}
                      ticks={Array.from(
                        { length: Math.floor(xAxisMax / 5) + 1 },
                        (_, i) => i * 5
                      )}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, yAxisMax]}
                      ticks={[0, 5, 10, 15, 20, 25]}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          className="bg-background border-border text-foreground shadow-xl rounded-lg text-xs font-medium"
                          labelFormatter={(value) => `Rally ${value}`}
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="teamB"
                      stroke="var(--color-teamB)"
                      strokeWidth={3}
                      dot={false}
                      name="teamB"
                      strokeOpacity={0.8}
                    />
                    <Line
                      type="monotone"
                      dataKey="teamA"
                      stroke="var(--color-teamA)"
                      strokeWidth={3}
                      dot={false}
                      name="teamA"
                      strokeOpacity={0.8}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </Card>
        </div>
      </ScrollablePageContent>
    </ScrollablePage>
  );
}
