"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useRefereeMatch } from "@/hooks/useRefereeMatch";
import { matchesApi } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  MoreVertical,
  Plus,
  Undo2,
  User,
  ArrowUpDown,
  ArrowLeftRight,
  Play,
  Trophy,
  BadgeQuestionMark,
} from "lucide-react";
import AddTeamDialog from "@/components/tournaments/AddTeamDialog";
import ScoreDrawer from "@/components/tournaments/ScoreDrawer";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { faker } from "@faker-js/faker";
import { cn } from "@/lib/utils";
import {
  ScrollablePage,
  ScrollablePageHeader,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";
import { createWebSocketConnection } from "@/lib/websocket";

export default function RefereeClient() {
  const params = useParams();
  const router = useRouter();
  const [positions, setPositions] = useState({
    pos1: null,
    pos2: null,
    pos3: null,
    pos4: null,
  });
  // Badminton: only bottom-left (pos2) or top-right (pos3) can start serving
  const [startingServerPosition, setStartingServerPosition] = useState("pos2");
  const [startDrawerOpen, setStartDrawerOpen] = useState(false);

  const queryClient = useQueryClient();
  const { data: matchData, isLoading } = useRefereeMatch(
    params.id,
    params.round,
    params.match
  );

  // Check if match is already started (safe to call even if matchData is null)
  const matchStatus = matchData?.status;
  const isMatchStarted = matchStatus === "in_progress" || matchStatus === "completed";
  const isMatchCompleted = matchStatus === "completed";

  // Track match completion state (can be updated via websocket)
  const [matchEnded, setMatchEnded] = useState(isMatchCompleted);
  const [winnerTeamId, setWinnerTeamId] = useState(matchData?.winner_team_id || null);
  const wsConnectionRef = useRef(null);

  // Fetch match state to get current positions (must be before conditional returns)
  const { data: matchState } = useQuery({
    queryKey: ["match-state", params.match],
    queryFn: async () => {
      try {
        const response = await matchesApi.getState(params.match);
        return response.data.data;
      } catch (error) {
        // Match might not be started yet, return null
        return null;
      }
    },
    enabled: !!params.match && !!matchData && isMatchStarted,
  });

  const startMatchMutation = useMutation({
    mutationFn: ({ matchId, positions, ...rest }) =>
      matchesApi.start(matchId, {
        ...rest, // serving_team_id, serving_player_id
        positions: {
          pos_1: positions.pos1,
          pos_2: positions.pos2,
          pos_3: positions.pos3,
          pos_4: positions.pos4,
        },
      }),
    onSuccess: (data) => {
      setStartDrawerOpen(false);
      toast.success("Match started successfully!");
      // Preserve team sides from API response so display doesn't reset
      const pos = data?.data?.positions ?? data?.positions;
      if (pos?.pos_1 != null && pos?.pos_2 != null && pos?.pos_3 != null && pos?.pos_4 != null) {
        setPositions({
          pos1: pos.pos_1,
          pos2: pos.pos_2,
          pos3: pos.pos_3,
          pos4: pos.pos_4,
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["referee-match", params.id, params.round, params.match],
      });
      queryClient.invalidateQueries({
        queryKey: ["match-state", params.match],
      });
    },
    onError: (error) => {
      const errorMessage =
        error?.response?.data?.message || "Failed to start match";
      toast.error(errorMessage);
    },
  });

  const recordPointMutation = useMutation({
    mutationFn: ({ matchId, rallyWinnerTeamId }) =>
      matchesApi.recordPoint(matchId, {
        rally_winner_team_id: rallyWinnerTeamId,
      }),
    onSuccess: (response) => {
      // Optimistically update the scores if available in response
      const updatedScores = response?.data?.data;
      if (updatedScores) {
        queryClient.setQueryData(
          ["referee-match", params.id, params.round, params.match],
          (oldData) => {
            if (oldData) {
              return {
                ...oldData,
                scores: {
                  teamA: updatedScores.teamA ?? updatedScores.team_a_score ?? oldData.scores?.teamA ?? 0,
                  teamB: updatedScores.teamB ?? updatedScores.team_b_score ?? oldData.scores?.teamB ?? 0,
                },
              };
            }
            return oldData;
          }
        );
      }

      console.log("Original assigned positions:", JSON.stringify(positions, null, 2));
      console.log("Updated Scores:", JSON.stringify(updatedScores, null, 2));

      // Apply updated positions from API (server-win swap etc.); API preserves initial court sides:
      // pos_1/pos_2 = left court, pos_3/pos_4 = right court (either team can be on either side)
      const pos = updatedScores?.positions ?? response?.data?.data?.positions;
      if (pos?.pos_1 != null && pos?.pos_2 != null && pos?.pos_3 != null && pos?.pos_4 != null) {
        setPositions({
          pos1: pos.pos_1,
          pos2: pos.pos_2,
          pos3: pos.pos_3,
          pos4: pos.pos_4,
        });
      }

      // Invalidate queries to ensure we have the latest data
      queryClient.invalidateQueries({
        queryKey: ["referee-match", params.id, params.round, params.match],
      });
      queryClient.invalidateQueries({
        queryKey: ["match-state", params.match],
      });
    },
    onError: (error) => {
      const errorMessage =
        error?.response?.data?.message || "Failed to record point";
      toast.error(errorMessage);
    },
  });

  const undoMutation = useMutation({
    mutationFn: (matchId) => matchesApi.undo(matchId),
    onSuccess: () => {
      toast.success("Point undone");
      queryClient.invalidateQueries({
        queryKey: ["referee-match", params.id, params.round, params.match],
      });
      queryClient.invalidateQueries({
        queryKey: ["match-state", params.match],
      });
    },
    onError: (error) => {
      const errorMessage =
        error?.response?.data?.message || "Failed to undo point";
      toast.error(errorMessage);
    },
  });

  // Update matchEnded state when matchData status changes
  useEffect(() => {
    if (matchData?.status === "completed") {
      setMatchEnded(true);
      setWinnerTeamId(matchData?.winner_team_id || null);
    }
  }, [matchData?.status, matchData?.winner_team_id]);

  // Connect to WebSocket to listen for match_end events
  useEffect(() => {
    if (!params.match || !isMatchStarted) return;

    const matchId = params.match;
    const ws = createWebSocketConnection(`/ws/match/${matchId}/score`, {
      onOpen: (event, wsInstance) => {
        console.log("WebSocket connected for referee match", matchId);
      },
      onClose: () => {
        console.log("WebSocket disconnected for referee match", matchId);
      },
      onError: (error) => {
        console.error("WebSocket error:", error);
      },
      onMessage: (data) => {
        if (data.type === "match_end") {
          setMatchEnded(true);
          setWinnerTeamId(data.winnerTeamId || null);
          toast.success("Match completed!");
          // Invalidate queries to get updated match data with winner
          queryClient.invalidateQueries({
            queryKey: ["referee-match", params.id, params.round, params.match],
          });
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
  }, [params.match, isMatchStarted]);

  // Load positions from API; API preserves initial court sides: left court = pos_1/pos_2, right court = pos_3/pos_4
  useEffect(() => {
    if (!isMatchStarted || !matchData) return;
    const stored =
      matchState?.display_positions ??
      matchState?.positions ??
      matchData?.display_positions ??
      matchData?.positions;
    if (stored && [stored.pos_1, stored.pos_2, stored.pos_3, stored.pos_4].every((v) => v != null)) {
      setPositions({
        pos1: stored.pos_1,
        pos2: stored.pos_2,
        pos3: stored.pos_3,
        pos4: stored.pos_4,
      });
      return;
    }
    // Fallback: derive from team_a_pos/team_b_pos (assumes Team A = left, Team B = right)
    if (matchState?.metadata) {
      const meta = matchState.metadata;
      setPositions({
        pos1: meta.team_a_pos?.right_player_id ?? null,
        pos2: meta.team_a_pos?.left_player_id ?? null,
        pos3: meta.team_b_pos?.right_player_id ?? null,
        pos4: meta.team_b_pos?.left_player_id ?? null,
      });
    } else if (matchData.metadata) {
      const meta = matchData.metadata;
      setPositions({
        pos1: meta.team_a_pos?.right_player_id ?? null,
        pos2: meta.team_a_pos?.left_player_id ?? null,
        pos3: meta.team_b_pos?.right_player_id ?? null,
        pos4: meta.team_b_pos?.left_player_id ?? null,
      });
    }
  }, [matchState, matchData, isMatchStarted]);

  if (isLoading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  if (!matchData) {
    return <div className="p-4 text-center">Match not found</div>;
  }

  const { tournament_name, players, scores, round, court, metadata } = matchData;

  // Detect Game ID (1 = Pickleball, 2 = Badminton)
  const gameId = matchState?.gameId || matchData?.gameId || 1;
  const isBadminton = gameId === 2;

  // Group players into teams by team_id
  const teamIds = [
    ...new Set(players?.map((p) => p.team_id).filter(Boolean) || []),
  ].sort((a, b) => a - b);
  const teamA =
    players
      ?.filter((p) => p.team_id === teamIds[0])
      .map((p) => ({ ...p, photo_url: faker.image.avatarGitHub() })) || [];
  const teamB =
    players
      ?.filter((p) => p.team_id === teamIds[1])
      .map((p) => ({ ...p, photo_url: faker.image.avatarGitHub() })) || [];

  // Get serving team/player information
  const servingTeamId = matchState?.serving_team_id;
  const serverSequence = matchState?.server_sequence;
  const servingPlayerIdState = matchState?.serving_player_id;

  const teamAScore = scores?.teamA || 0;
  const teamBScore = scores?.teamB || 0;
  const teamAId = teamIds[0] ? String(teamIds[0]) : null;
  const teamBId = teamIds[1] ? String(teamIds[1]) : null;

  const winnerTeamIdFromData = matchData?.winner_team_id || winnerTeamId;
  const isTeamAWinner = winnerTeamIdFromData && String(winnerTeamIdFromData) === teamAId;
  const isTeamBWinner = winnerTeamIdFromData && String(winnerTeamIdFromData) === teamBId;

  // Format score display (default: Team A - Team B; overridden below by position when both sides assigned)
  let currentScore = "0 - 0";
  if (isBadminton) {
    currentScore = `${teamAScore} - ${teamBScore}`;
  } else {
    currentScore = scores
      ? (serverSequence !== null && serverSequence !== undefined
        ? `${scores.teamA} - ${scores.teamB} - ${serverSequence}`
        : `${scores.teamA} - ${scores.teamB}`)
      : (serverSequence !== null && serverSequence !== undefined
        ? `0 - 0 - ${serverSequence}`
        : "0 - 0");
  }

  const isTeamAServing = servingTeamId && String(servingTeamId) === teamAId;
  const isTeamBServing = servingTeamId && String(servingTeamId) === teamBId;

  // Determine serve
  const getServingPlayerId = () => {
    if (!isMatchStarted) return null;

    if (isBadminton) {
      // Backend provides explicit serving_player_id for Badminton
      return servingPlayerIdState || null;
    }

    if (!servingTeamId || serverSequence === null || serverSequence === undefined) return null;

    if (isTeamAServing) {
      return serverSequence === 1 ? positions.pos1 : positions.pos2;
    } else if (isTeamBServing) {
      return serverSequence === 1 ? positions.pos3 : positions.pos4;
    }
    return null;
  };

  const servingPlayerId = getServingPlayerId();
  const isPlayerServing = (playerId) =>
    playerId != null && servingPlayerId != null && Number(servingPlayerId) === Number(playerId);

  // Team-based serving ring color (Team A = blue, Team B = green) regardless of court side
  const isPlayerTeamA = (playerId) => {
    const p = getPlayerById(playerId);
    return p != null && (String(p.team_id) === teamAId || p.team_id === teamIds[0]);
  };
  const isPlayerTeamB = (playerId) => {
    const p = getPlayerById(playerId);
    return p != null && (String(p.team_id) === teamBId || p.team_id === teamIds[1]);
  };
  const getServingRingClassName = (playerId) => {
    if (!isPlayerServing(playerId)) return "ring-4 ring-muted/20";
    const isTeamA = isPlayerTeamA(playerId);
    const ringColor = isTeamA ? "ring-brand-blue" : "ring-brand-green";
    return `ring-4 ${ringColor} ring-offset-2 ring-offset-background animate-pulse`;
  };
  const getServingBadgeClassName = (playerId) => {
    if (!isPlayerServing(playerId)) return "";
    return isPlayerTeamA(playerId)
      ? "bg-brand-blue text-white"
      : "bg-brand-green text-white";
  };
  const getServingBorderClassName = (playerId) => {
    if (!isPlayerServing(playerId)) return "border-border/50";
    return isPlayerTeamA(playerId)
      ? "border-brand-blue/50 bg-brand-blue/5"
      : "border-brand-green/50 bg-brand-green/5";
  };
  const getServingRingSmallClassName = (playerId) => {
    if (!isPlayerServing(playerId)) return "bg-muted border-border";
    return isPlayerTeamA(playerId)
      ? "bg-brand-blue/10 border-brand-blue ring-2 ring-brand-blue/30"
      : "bg-brand-green/10 border-brand-green ring-2 ring-brand-green/30";
  };

  const allPositionsAssigned =
    positions.pos1 &&
    positions.pos2 &&
    positions.pos3 &&
    positions.pos4;

  const handleStartMatch = () => {
    if (!allPositionsAssigned) {
      toast.error("Please assign all positions before starting the match");
      return;
    }

    // Default to team A serving first
    const servingTeamId = parseInt(teamAId);
    if (!servingTeamId) {
      toast.error("Invalid team configuration");
      return;
    }

    const payload = {
      matchId: parseInt(params.match),
      positions,
    };

    if (isBadminton) {
      // Only bottom-left (pos2) or top-right (pos3) can start serving in badminton doubles
      const firstServerId = startingServerPosition === "pos2" ? positions.pos2 : positions.pos3;
      if (!firstServerId) {
        toast.error("Missing starting server position (bottom-left or top-right)");
        return;
      }
      payload.serving_player_id = firstServerId;
    } else {
      // For Pickleball, we need serving_team_id
      payload.serving_team_id = servingTeamId;
    }

    console.log("Starting match with payload:", payload);
    startMatchMutation.mutate(payload);
  };

  const handleScoreUpdate = (teamId) => {
    if (matchEnded) {
      toast.error("Match has ended. Cannot add more points.");
      return;
    }
    const rallyWinnerTeamId = parseInt(teamId);
    if (!rallyWinnerTeamId) {
      toast.error("Invalid team ID");
      return;
    }
    recordPointMutation.mutate({
      matchId: parseInt(params.match),
      rallyWinnerTeamId,
    });
  };

  const handleStepBack = () => {
    undoMutation.mutate(parseInt(params.match));
  };

  // Get player by ID (handles number/string id from API or positions state)
  const getPlayerById = (playerId) => {
    if (playerId == null) return undefined;
    const numId = Number(playerId);
    return players?.find(
      (p) => p.id === playerId || Number(p.id) === numId || String(p.id) === String(playerId)
    );
  };

  // Check if team is assigned
  const isTeamAssigned = (side) => {
    if (side === "left") {
      return positions.pos1 && positions.pos2;
    } else {
      return positions.pos3 && positions.pos4;
    }
  };

  // Get which team is assigned to a side (court side: left = pos1/2, right = pos3/4)
  const getAssignedTeam = (side) => {
    if (side === "left" && positions.pos1) {
      const player = getPlayerById(positions.pos1);
      if (player && teamA.some((p) => Number(p.id) === Number(player.id))) return "teamA";
      if (player && teamB.some((p) => Number(p.id) === Number(player.id))) return "teamB";
    } else if (side === "right" && positions.pos3) {
      const player = getPlayerById(positions.pos3);
      if (player && teamA.some((p) => Number(p.id) === Number(player.id))) return "teamA";
      if (player && teamB.some((p) => Number(p.id) === Number(player.id))) return "teamB";
    }
    return null;
  };

  // Court-side panel data: SERVING and score panel follow court side (left/right), not fixed Team A/B
  const leftCourtTeam = getAssignedTeam("left");
  const rightCourtTeam = getAssignedTeam("right");
  const leftCourtTeamId = leftCourtTeam === "teamA" ? teamAId : leftCourtTeam === "teamB" ? teamBId : null;
  const rightCourtTeamId = rightCourtTeam === "teamA" ? teamAId : rightCourtTeam === "teamB" ? teamBId : null;
  const leftCourtScore = leftCourtTeam === "teamA" ? teamAScore : leftCourtTeam === "teamB" ? teamBScore : 0;
  const rightCourtScore = rightCourtTeam === "teamA" ? teamAScore : rightCourtTeam === "teamB" ? teamBScore : 0;
  const leftCourtIsServing = (leftCourtTeam === "teamA" && isTeamAServing) || (leftCourtTeam === "teamB" && isTeamBServing);
  const rightCourtIsServing = (rightCourtTeam === "teamA" && isTeamAServing) || (rightCourtTeam === "teamB" && isTeamBServing);
  const leftCourtName = leftCourtTeam === "teamA" ? "Team A" : leftCourtTeam === "teamB" ? "Team B" : "";
  const rightCourtName = rightCourtTeam === "teamA" ? "Team A" : rightCourtTeam === "teamB" ? "Team B" : "";
  const leftCourtIsWinner = (leftCourtTeam === "teamA" && isTeamAWinner) || (leftCourtTeam === "teamB" && isTeamBWinner);
  const rightCourtIsWinner = (rightCourtTeam === "teamA" && isTeamAWinner) || (rightCourtTeam === "teamB" && isTeamBWinner);
  const leftCourtIsTeamA = leftCourtTeam === "teamA";
  const rightCourtIsTeamA = rightCourtTeam === "teamA";

  // Align main score display by team position (left court - right court) when both sides assigned
  const usePositionScore =
    isTeamAssigned("left") &&
    isTeamAssigned("right") &&
    leftCourtTeam != null &&
    rightCourtTeam != null;
  if (usePositionScore) {
    if (isBadminton) {
      currentScore = `${leftCourtScore} - ${rightCourtScore}`;
    } else {
      const leftVal = leftCourtScore;
      const rightVal = rightCourtScore;
      currentScore =
        serverSequence !== null && serverSequence !== undefined
          ? `${leftVal} - ${rightVal} - ${serverSequence}`
          : `${leftVal} - ${rightVal}`;
    }
  }

  // Check if the other team (not assigned to the given side) has enough players
  const hasOtherTeamEnoughPlayers = (side) => {
    const assignedTeam = getAssignedTeam(side);
    if (!assignedTeam) return true; // If no team assigned on this side, show button

    // Get the other team (the one NOT assigned to this side)
    const otherTeam = assignedTeam === "teamA" ? teamB : teamA;
    return otherTeam && otherTeam.length >= 2;
  };

  // Handle team assignment with auto-fill
  const handleTeamAssign = (side, team) => {
    const newPositions = { ...positions };

    // Determine which team this is (Team A or Team B)
    const isTeamA = teamA.some((p) => p.id === team[0]?.id);
    const otherTeam = isTeamA ? teamB : teamA;

    if (side === "left" && team.length >= 2) {
      // Assign selected team to left side (pos1 and pos2)
      newPositions.pos1 = team[0].id;
      newPositions.pos2 = team[1].id;

      // Auto-fill the other team to the right side if not already assigned
      if (otherTeam && otherTeam.length >= 2 && !isTeamAssigned("right")) {
        newPositions.pos3 = otherTeam[0].id;
        newPositions.pos4 = otherTeam[1].id;
      }
    } else if (side === "right" && team.length >= 2) {
      // Assign selected team to right side (pos3 and pos4)
      newPositions.pos3 = team[0].id;
      newPositions.pos4 = team[1].id;

      // Auto-fill the other team to the left side if not already assigned
      if (otherTeam && otherTeam.length >= 2 && !isTeamAssigned("left")) {
        newPositions.pos1 = otherTeam[0].id;
        newPositions.pos2 = otherTeam[1].id;
      }
    }

    setPositions(newPositions);
  };

  // Handle team removal
  const handleTeamRemove = (side) => {
    const newPositions = { ...positions };

    if (side === "left") {
      newPositions.pos1 = null;
      newPositions.pos2 = null;
    } else {
      newPositions.pos3 = null;
      newPositions.pos4 = null;
    }

    setPositions(newPositions);
  };

  // Handle swap positions within a team
  const handleSwap = (side) => {
    const newPositions = { ...positions };

    if (side === "left") {
      // Swap pos1 and pos2
      const temp = newPositions.pos1;
      newPositions.pos1 = newPositions.pos2;
      newPositions.pos2 = temp;
    } else {
      // Swap pos3 and pos4
      const temp = newPositions.pos3;
      newPositions.pos3 = newPositions.pos4;
      newPositions.pos4 = temp;
    }

    setPositions(newPositions);
  };

  // Handle team swap (swap entire teams between left and right)
  const handleTeamSwap = () => {
    const newPositions = { ...positions };

    // Swap left team (pos1, pos2) with right team (pos3, pos4)
    const tempPos1 = newPositions.pos1;
    const tempPos2 = newPositions.pos2;
    newPositions.pos1 = newPositions.pos3;
    newPositions.pos2 = newPositions.pos4;
    newPositions.pos3 = tempPos1;
    newPositions.pos4 = tempPos2;

    setPositions(newPositions);
  };

  return (
    <ScrollablePage className="h-dvh bg-background">
      {/* Header */}
      <ScrollablePageHeader className="pb-0 bg-transparent">
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
          <div className="flex items-center justify-between px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="size-5" />
            </Button>
            <h1 className="text-lg max-w-[256px] truncate font-bold text-center">
              {tournament_name}
            </h1>
            <Button variant="ghost" size="icon">
              <MoreVertical className="size-5" />
            </Button>
          </div>
        </header>
      </ScrollablePageHeader>

      <ScrollablePageContent className="pb-24 pt-4 relative">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 inset-x-0 h-48 bg-linear-to-b from-brand-blue/10 to-transparent skew-y-3 origin-top-left scale-110 pointer-events-none -z-10" />
        <div className="absolute top-0 right-0 size-64 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none -z-10" />

        {/* Score Section */}
        <div className="p-4">
          <div className=" flex items-center justify-center gap-3 mb-4">
            <div className="relative bg-primary text-4xl font-black tabular-nums tracking-tighter py-4 px-12 rounded-2xl shadow-xl shadow-primary/20 text-center border-4 border-background ring-1 ring-border/20">
              <span className="text-primary-foreground">{currentScore}</span>

              {isMatchStarted && (
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={handleStepBack}
                  disabled={undoMutation.isPending}
                  className="absolute top-1/2 -translate-y-1/2 -left-14 rounded-full shadow-md bg-background hover:bg-muted border border-border"
                >
                  <Undo2 className="size-5 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>

          {/* Match Completed Indicator */}
          {matchEnded && (
            <div className="mb-6 flex items-center justify-center">
              <div className="px-6 py-2 bg-green-500/10 border border-green-500/20 rounded-full backdrop-blur-sm">
                <div className="text-sm font-black text-green-600 text-center uppercase tracking-wide flex items-center gap-2">
                  <span>🏆</span> Match Completed
                </div>
                {winnerTeamIdFromData && (
                  <div className="text-xs font-bold text-green-700 text-center mt-1 uppercase tracking-wide">
                    {isTeamAWinner ? "Team A Wins!" : isTeamBWinner ? "Team B Wins!" : "Match Finished"}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Serving Team Indicator */}
          {isMatchStarted && servingTeamId && !matchEnded && (
            <div className="mb-6 flex items-center justify-center gap-2">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Serving:</div>
              <div
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-sm border",
                  isTeamAServing
                    ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                    : isTeamBServing
                      ? "bg-red-500/10 text-red-600 border-red-500/20"
                      : "bg-muted text-muted-foreground border-border"
                )}
              >
                {isTeamAServing
                  ? `Team A ${serverSequence ? `• S${serverSequence}` : ""}`
                  : isTeamBServing
                    ? `Team B ${serverSequence ? `• S${serverSequence}` : ""}`
                    : "Unknown"}
              </div>
            </div>
          )}

          {/* Court Layout - Complex Grid */}
          <div className="mb-6">
            <div
              className={cn(
                "grid gap-1 border-4 border-muted/30 rounded-xl overflow-hidden shadow-sm bg-muted/10",
                teamAId &&
                  teamBId &&
                  teamA.length > 0 &&
                  teamB.length > 0 &&
                  isTeamAssigned("left") &&
                  isTeamAssigned("right")
                  ? "grid-cols-5"
                  : "grid-cols-3"
              )}
            >
              {/* Left court side (Serve/Score) — team on left court (pos1/2), so SERVING shows on left when that team serves */}
              {teamAId &&
                teamBId &&
                teamA.length > 0 &&
                teamB.length > 0 &&
                isTeamAssigned("left") &&
                isTeamAssigned("right") && (
                  <div
                    className={cn(
                      "col-span-1 flex flex-col items-center justify-center min-h-[200px] gap-2 border-r border-dashed",
                      leftCourtIsTeamA
                        ? "bg-linear-to-b from-brand-blue/20 to-brand-blue/5 border-brand-blue/20"
                        : "bg-linear-to-b from-brand-green/20 to-brand-green/5 border-brand-green/20"
                    )}
                  >
                    {matchEnded ? (
                      <div className="flex flex-col items-center gap-2 px-4">
                        {leftCourtIsWinner ? (
                          <>
                            <div className="text-xs font-black bg-yellow-500 text-white px-2 py-0.5 rounded shadow-sm">
                              WINNER
                            </div>
                            <div
                              className={cn(
                                "text-xs font-bold text-center uppercase",
                                leftCourtIsTeamA ? "text-brand-blue" : "text-brand-green"
                              )}
                            >
                              {leftCourtName}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs font-medium text-center text-muted-foreground opacity-50">
                            {leftCourtName}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {isMatchStarted && (
                          <div
                            className={cn(
                              "text-2xl font-black tabular-nums",
                              leftCourtIsTeamA ? "text-brand-blue" : "text-brand-green"
                            )}
                          >
                            {leftCourtScore}
                          </div>
                        )}
                        {leftCourtIsServing && (
                          <div
                            className={cn(
                              "text-[10px] font-black text-white px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm animate-pulse",
                              leftCourtIsTeamA ? "bg-brand-blue" : "bg-brand-green"
                            )}
                          >
                            SERVING
                          </div>
                        )}
                        {leftCourtTeamId && isMatchStarted && (
                          <ScoreDrawer
                            isLoading={recordPointMutation.isPending}
                            teamId={leftCourtTeamId}
                            teamName={leftCourtName}
                            currentScore={leftCourtScore}
                            onConfirm={handleScoreUpdate}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={matchEnded || !isMatchStarted}
                                className={cn(
                                  "size-12 rounded-full shadow-lg transition-all duration-200",
                                  leftCourtIsServing
                                    ? leftCourtIsTeamA
                                      ? "bg-brand-blue text-white hover:bg-brand-blue/90 hover:scale-110 ring-4 ring-brand-blue/20"
                                      : "bg-brand-green text-white hover:bg-brand-green/90 hover:scale-110 ring-4 ring-brand-green/20"
                                    : "bg-background text-muted-foreground border-2 border-border",
                                  leftCourtIsTeamA ? "hover:text-brand-blue" : "hover:text-brand-green",
                                  (matchEnded || !isMatchStarted) && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                <Plus className="size-6" />
                              </Button>
                            }
                          />
                        )}
                      </>
                    )}
                  </div>
                )}

              {/* Center Grid (Court Positions) */}
              <div className="col-span-3 relative bg-background">
                {/* Team Swap Button */}
                {(isTeamAssigned("left") || isTeamAssigned("right")) && !isMatchStarted && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={handleTeamSwap}
                      title="Swap Teams"
                      className="size-8 rounded-full shadow-md border border-border bg-background hover:bg-muted"
                    >
                      <ArrowLeftRight className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-px bg-border/20 min-h-[200px]">
                  {/* Left Side - Team A Positions */}
                  <div className="flex flex-col bg-background">
                    {!isTeamAssigned("left") ? (
                      <div className="flex items-center justify-center min-h-[200px] p-2">
                        {isTeamAssigned("right") &&
                          !hasOtherTeamEnoughPlayers("right") ? (
                          <div className="text-center text-xs font-medium text-muted-foreground px-4">
                            No players available
                          </div>
                        ) : (
                          <AddTeamDialog
                            teamA={teamA}
                            teamB={teamB}
                            onSelectTeam={handleTeamAssign}
                            side="left"
                            currentPositions={positions}
                          />
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Top - pos1 */}
                        <div className="flex-1 flex flex-col items-center justify-center border-b border-dashed border-border/50 p-2 relative group hover:bg-muted/5 transition-colors">
                          {!isMatchStarted && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="z-10 absolute -bottom-4 left-1/2 -translate-x-1/2 size-7 rounded-full bg-background border border-border shadow-sm hover:bg-muted"
                              onClick={() => handleSwap("left")}
                              title="Swap positions"
                            >
                              <ArrowUpDown className="size-3 text-muted-foreground" />
                            </Button>
                          )}
                          <div className="flex flex-col items-center gap-2 w-full">
                            <div className="relative">
                              <div className={cn(
                                "size-14 rounded-full bg-muted flex items-center justify-center transition-all",
                                getServingRingClassName(positions.pos1)
                              )}>
                                <User className="size-6 text-muted-foreground" />
                              </div>
                              {isPlayerServing(positions.pos1) && (
                                <div className={cn("absolute -top-1 -right-1 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm", getServingBadgeClassName(positions.pos1))}>
                                  Serve
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-bold text-center truncate w-full px-1">
                              {getPlayerById(positions.pos1)?.name ||
                                getPlayerById(positions.pos1)?.username ||
                                "Player"}
                            </span>
                          </div>
                        </div>
                        {/* Bottom - pos2 */}
                        <div className="flex-1 flex flex-col items-center justify-center p-2 relative group hover:bg-muted/5 transition-colors">
                          <div className="flex flex-col items-center gap-2 w-full">
                            <div className="relative">
                              <div className={cn(
                                "size-14 rounded-full bg-muted flex items-center justify-center transition-all",
                                getServingRingClassName(positions.pos2)
                              )}>
                                <User className="size-6 text-muted-foreground" />
                              </div>
                              {isPlayerServing(positions.pos2) && (
                                <div className={cn("absolute -top-1 -right-1 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm", getServingBadgeClassName(positions.pos2))}>
                                  Serve
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-bold text-center truncate w-full px-1">
                              {getPlayerById(positions.pos2)?.name ||
                                getPlayerById(positions.pos2)?.username ||
                                "Player"}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right Side - Team B Positions */}
                  <div className="flex flex-col bg-background">
                    {!isTeamAssigned("right") ? (
                      <div className="flex items-center justify-center min-h-[200px] p-2">
                        {isTeamAssigned("left") &&
                          !hasOtherTeamEnoughPlayers("left") ? (
                          <div className="text-center text-xs font-medium text-muted-foreground px-4">
                            No players available
                          </div>
                        ) : (
                          <AddTeamDialog
                            teamA={teamA}
                            teamB={teamB}
                            onSelectTeam={handleTeamAssign}
                            side="right"
                            currentPositions={positions}
                          />
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Top - pos3 */}
                        <div className="flex-1 flex flex-col items-center justify-center border-b border-dashed border-border/50 p-2 relative group hover:bg-muted/5 transition-colors">
                          {!isMatchStarted && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="z-10 absolute -bottom-4 left-1/2 -translate-x-1/2 size-7 rounded-full bg-background border border-border shadow-sm hover:bg-muted"
                              onClick={() => handleSwap("right")}
                              title="Swap positions"
                            >
                              <ArrowUpDown className="size-3 text-muted-foreground" />
                            </Button>
                          )}
                          <div className="flex flex-col items-center gap-2 w-full">
                            <div className="relative">
                              <div className={cn(
                                "size-14 rounded-full bg-muted flex items-center justify-center transition-all",
                                getServingRingClassName(positions.pos3)
                              )}>
                                <User className="size-6 text-muted-foreground" />
                              </div>
                              {isPlayerServing(positions.pos3) && (
                                <div className={cn("absolute -top-1 -right-1 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm", getServingBadgeClassName(positions.pos3))}>
                                  Serve
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-bold text-center truncate w-full px-1">
                              {getPlayerById(positions.pos3)?.name ||
                                getPlayerById(positions.pos3)?.username ||
                                "Player"}
                            </span>
                          </div>
                        </div>
                        {/* Bottom - pos4 */}
                        <div className="flex-1 flex flex-col items-center justify-center p-2 relative group hover:bg-muted/5 transition-colors">
                          <div className="flex flex-col items-center gap-2 w-full">
                            <div className="relative">
                              <div className={cn(
                                "size-14 rounded-full bg-muted flex items-center justify-center transition-all",
                                getServingRingClassName(positions.pos4)
                              )}>
                                <User className="size-6 text-muted-foreground" />
                              </div>
                              {isPlayerServing(positions.pos4) && (
                                <div className={cn("absolute -top-1 -right-1 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm", getServingBadgeClassName(positions.pos4))}>
                                  Serve
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-bold text-center truncate w-full px-1">
                              {getPlayerById(positions.pos4)?.name ||
                                getPlayerById(positions.pos4)?.username ||
                                "Player"}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right court side (Serve/Score) — team on right court (pos3/4) */}
              {teamAId &&
                teamBId &&
                teamA.length > 0 &&
                teamB.length > 0 &&
                isTeamAssigned("left") &&
                isTeamAssigned("right") && (
                  <div
                    className={cn(
                      "col-span-1 flex flex-col items-center justify-center min-h-[200px] gap-2 border-l border-dashed",
                      rightCourtIsTeamA
                        ? "bg-linear-to-b from-brand-blue/20 to-brand-blue/5 border-brand-blue/20"
                        : "bg-linear-to-b from-brand-green/20 to-brand-green/5 border-brand-green/20"
                    )}
                  >
                    {matchEnded ? (
                      <div className="flex flex-col items-center gap-2 px-4">
                        {rightCourtIsWinner ? (
                          <>
                            <div className="text-xs font-black bg-yellow-500 text-white px-2 py-0.5 rounded shadow-sm">
                              WINNER
                            </div>
                            <div
                              className={cn(
                                "text-xs font-bold text-center uppercase",
                                rightCourtIsTeamA ? "text-brand-blue" : "text-brand-green"
                              )}
                            >
                              {rightCourtName}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs font-medium text-center text-muted-foreground opacity-50">
                            {rightCourtName}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {isMatchStarted && (
                          <div
                            className={cn(
                              "text-2xl font-black tabular-nums",
                              rightCourtIsTeamA ? "text-brand-blue" : "text-brand-green"
                            )}
                          >
                            {rightCourtScore}
                          </div>
                        )}
                        {rightCourtIsServing && (
                          <div
                            className={cn(
                              "text-[10px] font-black text-white px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm animate-pulse",
                              rightCourtIsTeamA ? "bg-brand-blue" : "bg-brand-green"
                            )}
                          >
                            SERVING
                          </div>
                        )}
                        {rightCourtTeamId && isMatchStarted && (
                          <ScoreDrawer
                            isLoading={recordPointMutation.isPending}
                            teamId={rightCourtTeamId}
                            teamName={rightCourtName}
                            currentScore={rightCourtScore}
                            onConfirm={handleScoreUpdate}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={matchEnded}
                                className={cn(
                                  "size-12 rounded-full shadow-lg transition-all duration-200",
                                  rightCourtIsServing
                                    ? rightCourtIsTeamA
                                      ? "bg-brand-blue text-white hover:bg-brand-blue/90 hover:scale-110 ring-4 ring-brand-blue/20"
                                      : "bg-brand-green text-white hover:bg-brand-green/90 hover:scale-110 ring-4 ring-brand-green/20"
                                    : "bg-background text-muted-foreground border-2 border-border",
                                  rightCourtIsTeamA ? "hover:text-brand-blue" : "hover:text-brand-green",
                                  (matchEnded) && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                <Plus className="size-6" />
                              </Button>
                            }
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
            </div>
          </div>

          {/* Viewer Icon */}
          <div className="flex justify-center mb-6">
            <div className="flex flex-col items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
              <User className="size-6 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                You (Referee)
              </span>
            </div>
          </div>

          {/* Start Match: trigger opens drawer to pick server and start */}
          {allPositionsAssigned && !isMatchStarted && (
            <div className="mb-6 flex justify-center">
              <Drawer open={startDrawerOpen} onOpenChange={setStartDrawerOpen} className="max-w-2xl">
                <DrawerTrigger asChild>
                  <Button
                    size="lg"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl  px-8 h-12"
                  >
                    <Play className="size-5 mr-2 fill-current" />
                    Start
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="overflow-hidden max-w-[500px] mx-auto">
                  <DrawerHeader className="text-center pb-2">
                    <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-2 ring-primary/30">
                      <Trophy className="size-6" />
                    </div>
                    <DrawerTitle className="text-xl font-black tracking-tight text-foreground">
                      Start Match
                    </DrawerTitle>
                    <DrawerDescription className="text-base text-muted-foreground">
                      Pick who serves first, then hit start.
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="p-4 space-y-4 w-full">
                    {isBadminton && (
                      <div className="flex flex-col gap-3 rounded-2xl">
                        <p className="flex items-center gap-2 font-black uppercase tracking-wider text-foreground">
                          <BadgeQuestionMark className="size-5" />
                          Who serves first?
                        </p>
                        <p className="text-xs text-muted-foreground -mt-1">Bottom-left or top-right only</p>
                        <div className="grid grid-cols-2 gap-4">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setStartingServerPosition("pos2")}
                            className={cn(
                              "flex flex-col items-start justify-start h-auto gap-0 w-full",
                              startingServerPosition === "pos2"
                              && "border-primary bg-primary text-primary-foreground scale-[1.02]"
                            )}
                          >
                            <span className="text-[10px] font-bold uppercase tracking-wider text-current/80">Bottom left</span>
                            <span className="text-xs font-bold uppercase tracking-wider max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                              {getPlayerById(positions.pos2)?.name || getPlayerById(positions.pos2)?.username || "—"}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setStartingServerPosition("pos3")}
                            className={cn(
                              "flex flex-col items-start justify-start h-auto gap-0 w-full",
                              startingServerPosition === "pos3"
                              && "border-primary bg-primary text-primary-foreground scale-[1.02]"
                            )}
                          >
                            <span className="text-[10px] font-bold uppercase tracking-wider text-current/80">Top right</span>
                            <span className="text-xs font-bold uppercase tracking-wider">

                              {getPlayerById(positions.pos3)?.name || getPlayerById(positions.pos3)?.username || "—"}
                            </span>
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <DrawerFooter className="pt-4 pb-6">
                    <Button
                      onClick={handleStartMatch}
                      disabled={startMatchMutation.isPending}
                      size="lg"
                      className="h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-base transition-all hover:scale-[1.02] active:scale-[0.98] w-full"
                    >
                      <Play className="size-5 mr-2 fill-current" />
                      {startMatchMutation.isPending ? "Starting…" : "Start Match"}
                    </Button>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            </div>
          )}

          {/* Match Details */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50 text-center">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Round</div>
              <div className="font-bold text-sm">{round}</div>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50 text-center">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Court</div>
              <div className="font-bold text-sm">{court}</div>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50 text-center">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Viewer</div>
              <div className="font-bold text-sm">3</div>
            </div>
          </div>

          {/* Teams Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground">Team Rosters</h3>
            </div>

            <Tabs defaultValue="right" className="w-full">
              <TabsList className="w-full h-10 p-1 bg-muted/30 rounded-lg grid grid-cols-2 mb-4">
                <TabsTrigger value="left" className="rounded-md text-xs font-bold uppercase data-[state=active]:bg-background data-[state=active]:text-foreground transition-all">Left Side</TabsTrigger>
                <TabsTrigger value="right" className="rounded-md text-xs font-bold uppercase data-[state=active]:bg-background data-[state=active]:text-foreground transition-all">Right Side</TabsTrigger>
              </TabsList>

              <TabsContent value="left" className="space-y-2 mt-0">
                {isTeamAssigned("left") ? (
                  <>
                    {positions.pos1 && (
                      <div className={cn(
                        "flex items-center gap-3 p-3 bg-muted/20 rounded-xl border transition-all",
                        getServingBorderClassName(positions.pos1)
                      )}>
                        <div className={cn(
                          "size-8 rounded-full flex items-center justify-center border transition-all",
                          getServingRingSmallClassName(positions.pos1)
                        )}>
                          <User className="size-4 text-muted-foreground" />
                        </div>
                        <span className="font-bold text-sm flex-1">
                          {getPlayerById(positions.pos1)?.name ||
                            getPlayerById(positions.pos1)?.username ||
                            "Player"}
                        </span>
                        {isPlayerServing(positions.pos1) && (
                          <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider", getServingBadgeClassName(positions.pos1))}>
                            Serving
                          </span>
                        )}
                      </div>
                    )}
                    {positions.pos2 && (
                      <div className={cn(
                        "flex items-center gap-3 p-3 bg-muted/20 rounded-xl border transition-all",
                        getServingBorderClassName(positions.pos2)
                      )}>
                        <div className={cn(
                          "size-8 rounded-full flex items-center justify-center border transition-all",
                          getServingRingSmallClassName(positions.pos2)
                        )}>
                          <User className="size-4 text-muted-foreground" />
                        </div>
                        <span className="font-bold text-sm flex-1">
                          {getPlayerById(positions.pos2)?.name ||
                            getPlayerById(positions.pos2)?.username ||
                            "Player"}
                        </span>
                        {isPlayerServing(positions.pos2) && (
                          <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider", getServingBadgeClassName(positions.pos2))}>
                            Serving
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 bg-muted/10 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground">
                    No team assigned to left side
                  </div>
                )}
              </TabsContent>

              <TabsContent value="right" className="space-y-2 mt-0">
                {isTeamAssigned("right") ? (
                  <>
                    {positions.pos3 && (
                      <div className={cn(
                        "flex items-center gap-3 p-3 bg-muted/20 rounded-xl border transition-all",
                        getServingBorderClassName(positions.pos3)
                      )}>
                        <div className={cn(
                          "size-8 rounded-full flex items-center justify-center border transition-all",
                          getServingRingSmallClassName(positions.pos3)
                        )}>
                          <User className="size-4 text-muted-foreground" />
                        </div>
                        <span className="font-bold text-sm flex-1">
                          {getPlayerById(positions.pos3)?.name ||
                            getPlayerById(positions.pos3)?.username ||
                            "Player"}
                        </span>
                        {isPlayerServing(positions.pos3) && (
                          <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider", getServingBadgeClassName(positions.pos3))}>
                            Serving
                          </span>
                        )}
                      </div>
                    )}
                    {positions.pos4 && (
                      <div className={cn(
                        "flex items-center gap-3 p-3 bg-muted/20 rounded-xl border transition-all",
                        getServingBorderClassName(positions.pos4)
                      )}>
                        <div className={cn(
                          "size-8 rounded-full flex items-center justify-center border transition-all",
                          getServingRingSmallClassName(positions.pos4)
                        )}>
                          <User className="size-4 text-muted-foreground" />
                        </div>
                        <span className="font-bold text-sm flex-1">
                          {getPlayerById(positions.pos4)?.name ||
                            getPlayerById(positions.pos4)?.username ||
                            "Player"}
                        </span>
                        {isPlayerServing(positions.pos4) && (
                          <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider", getServingBadgeClassName(positions.pos4))}>
                            Serving
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 bg-muted/10 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground">
                    No team assigned to right side
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </ScrollablePageContent>
    </ScrollablePage>
  );
}
