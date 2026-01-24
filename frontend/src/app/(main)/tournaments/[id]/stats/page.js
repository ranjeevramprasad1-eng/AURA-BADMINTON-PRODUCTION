"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createWebSocketConnection } from "@/lib/websocket";
import { useTournament } from "@/hooks/useTournament";
import { useTournamentRound } from "@/hooks/useTournamentRound";
import { useTournamentRounds } from "@/hooks/useTournamentRounds";
import { useTournamentEngine } from "@/hooks/useTournamentEngine";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TournamentStatsHeader } from "@/components/tournaments/TournamentStatsHeader";
import { RoundNavigation } from "@/components/tournaments/RoundNavigation";
import { PairingsTab } from "@/components/tournaments/PairingsTab";
import { LeaderboardTab } from "@/components/tournaments/LeaderboardTab";
import { ScrollablePage, ScrollablePageHeader, ScrollablePageContent } from "@/components/layout/ScrollablePage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trophy, Users, Crown, Medal, ChevronRight, Zap, Target, Award } from "lucide-react";
import { getTournamentCategory } from "@/lib/utils";

// Helper to format round name for display
const formatRoundName = (roundKey) => {
  if (!roundKey) return '';
  if (roundKey.startsWith('GS-')) {
    // GS-A-R1 -> Group A - Round 1
    const parts = roundKey.split('-');
    if (parts.length === 3) {
      return `Group ${parts[1]} - Round ${parts[2].replace('R', '')}`;
    }
  }
  if (roundKey === 'QF') return 'Quarter Finals';
  if (roundKey === 'SF') return 'Semi Finals';
  if (roundKey === 'F') return 'Final';
  return roundKey;
};

// Group Standings Component for Group+Knockout format
function GroupStandings({ standings, engineInfo, matches, selectedRound, selectedGroup }) {
  // Determine if we're in knockout stage
  const isKnockoutStage = engineInfo?.stage === 'knockout' || engineInfo?.stage === 'complete';

  // Get knockout matches
  const knockoutMatches = matches?.filter(m =>
    m.round === 'QF' || m.round === 'SF' || m.round === 'F'
  ) || [];

  // Format round name
  const formatRoundName = (round) => {
    if (round === 'QF') return 'Quarter Finals';
    if (round === 'SF') return 'Semi Finals';
    if (round === 'F') return 'Final';
    return round;
  };

  // Check if selected round is a knockout round (new format: direct match)
  const isKnockoutRoundSelected = selectedRound && ['QF', 'SF', 'F'].includes(selectedRound);

  // For group rounds, selectedRound is now "R1", "R2", etc. and selectedGroup is "A", "B", "all"
  const isGroupRoundSelected = selectedRound && !isKnockoutRoundSelected;

  // Determine which group to show in standings
  const groupToShow = selectedGroup && selectedGroup !== 'all' ? `Group ${selectedGroup}` : null;

  // Render knockout bracket
  const renderKnockoutBracket = () => {
    if (knockoutMatches.length === 0) return null;

    // Group by round
    const matchesByRound = knockoutMatches.reduce((acc, match) => {
      const round = match.round || 'Unknown';
      if (!acc[round]) acc[round] = [];
      acc[round].push(match);
      return acc;
    }, {});

    const roundOrder = ['QF', 'SF', 'F'];
    const availableRounds = roundOrder.filter(r => matchesByRound[r]);

    // Find the tournament champion (winner of the Final)
    const finalMatch = matchesByRound['F']?.[0];
    const championTeamId = finalMatch?.status === 'completed' ? finalMatch.winner_team_id : null;
    const championName = championTeamId
      ? (championTeamId === finalMatch?.team1?.team_id
        ? (finalMatch.team1?.name || finalMatch.team1?.display_name)
        : (finalMatch.team2?.name || finalMatch.team2?.display_name))
      : null;

    return (
      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Award className="size-5 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-wider">Knockout Bracket</h3>
        </div>

        {/* Champion Banner */}
        {championName && (
          <Card className="overflow-hidden border-2 border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30">
            <CardContent className="p-4 flex items-center justify-center gap-3">
              <Trophy className="size-8 text-yellow-500" />
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-600 dark:text-yellow-400">Champion</p>
                <p className="text-lg font-black text-yellow-700 dark:text-yellow-300">{championName}</p>
              </div>
              <Trophy className="size-8 text-yellow-500" />
            </CardContent>
          </Card>
        )}

        {availableRounds.map((round) => {
          const roundMatches = matchesByRound[round] || [];
          const isFinal = round === 'F';
          const isSemiFinal = round === 'SF';

          return (
            <Card key={round} className={`overflow-hidden ${isFinal
              ? 'border-2 border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10'
              : isSemiFinal
                ? 'border-blue-200 bg-blue-50/30 dark:bg-blue-950/10'
                : ''
              }`}>
              <CardHeader className={`py-3 px-4 ${isFinal
                ? 'bg-gradient-to-r from-primary/20 to-primary/10'
                : isSemiFinal
                  ? 'bg-blue-100/50 dark:bg-blue-900/20'
                  : 'bg-muted/30'
                }`}>
                <CardTitle className={`font-black uppercase tracking-wider flex items-center gap-2 ${isFinal ? 'text-sm' : 'text-xs'
                  }`}>
                  {isFinal && <Trophy className="size-4 text-yellow-500" />}
                  {isSemiFinal && <Zap className="size-3 text-blue-500" />}
                  {formatRoundName(round)}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {roundMatches.map((match, idx) => {
                  const team1Name = match.team1?.name || match.team1?.display_name || 'TBD';
                  const team2Name = match.team2?.name || match.team2?.display_name || 'TBD';
                  const isComplete = match.status === 'completed';
                  const isLive = match.status === 'in_progress';
                  const winner = match.winner_team_id;
                  const team1Won = winner === match.team1?.team_id;
                  const team2Won = winner === match.team2?.team_id;

                  return (
                    <div key={match.match_id || idx} className={`${isFinal ? 'p-4' : 'p-3'} ${idx > 0 ? 'border-t' : ''} ${isLive ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                      <div className={`space-y-${isFinal ? '3' : '2'}`}>
                        {/* Team 1 */}
                        <div className={`flex items-center justify-between rounded-lg p-2 ${team1Won
                          ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
                          : team2Won
                            ? 'bg-muted/30 opacity-60'
                            : 'bg-muted/20'
                          }`}>
                          <div className="flex items-center gap-2">
                            {team1Won && <Crown className="size-4 text-yellow-500" />}
                            <span className={`${isFinal ? 'text-base font-bold' : 'text-sm font-medium'} ${team1Won ? 'text-green-700 dark:text-green-300' : ''}`}>
                              {team1Name}
                            </span>
                          </div>
                          {team1Won && <Badge className="bg-green-500 text-white text-[10px]">WINNER</Badge>}
                        </div>
                        {/* VS Divider */}
                        <div className="flex items-center gap-2 py-1">
                          <div className="h-px flex-1 bg-border/50" />
                          <span className={`font-black ${isFinal ? 'text-xs text-primary' : 'text-[10px] text-muted-foreground/50'}`}>VS</span>
                          <div className="h-px flex-1 bg-border/50" />
                        </div>
                        {/* Team 2 */}
                        <div className={`flex items-center justify-between rounded-lg p-2 ${team2Won
                          ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
                          : team1Won
                            ? 'bg-muted/30 opacity-60'
                            : 'bg-muted/20'
                          }`}>
                          <div className="flex items-center gap-2">
                            {team2Won && <Crown className="size-4 text-yellow-500" />}
                            <span className={`${isFinal ? 'text-base font-bold' : 'text-sm font-medium'} ${team2Won ? 'text-green-700 dark:text-green-300' : ''}`}>
                              {team2Name}
                            </span>
                          </div>
                          {team2Won && <Badge className="bg-green-500 text-white text-[10px]">WINNER</Badge>}
                        </div>
                      </div>
                      {/* Status */}
                      <div className="mt-3 flex justify-center">
                        {isLive && (
                          <Badge className="text-[10px] bg-red-500 animate-pulse px-3">🔴 LIVE</Badge>
                        )}
                        {isComplete && !isFinal && (
                          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                            ✓ COMPLETE
                          </Badge>
                        )}
                        {!isLive && !isComplete && (
                          <Badge variant="outline" className="text-[10px] px-3">UPCOMING</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  // Show message if no standings and no knockout matches
  if ((!standings || Object.keys(standings).length === 0) && knockoutMatches.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No standings available yet</p>
        <p className="text-sm">Matches need to be played first</p>
      </div>
    );
  }

  const groupKeys = Object.keys(standings || {}).sort();

  // Filter groups based on selectedGroup (which comes from the Group A/B toggle)
  const filteredGroupKeys = groupToShow
    ? groupKeys.filter(key => key === groupToShow)
    : groupKeys;

  // Should show group standings?
  const showGroupStandings = !isKnockoutRoundSelected && filteredGroupKeys.length > 0;

  // Should show knockout bracket?
  const showKnockout = isKnockoutRoundSelected || (!isGroupRoundSelected && (isKnockoutStage || knockoutMatches.length > 0));

  // Filter knockout matches by selected round if a knockout round is selected
  const filteredKnockoutMatches = isKnockoutRoundSelected
    ? knockoutMatches.filter(m => m.round === selectedRound)
    : knockoutMatches;

  return (
    <div className="space-y-6">
      {/* Knockout Bracket */}
      {showKnockout && filteredKnockoutMatches.length > 0 && (
        <>
          {/* Render knockout bracket with filtered matches */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="size-5 text-primary" />
              <h3 className="text-sm font-black uppercase tracking-wider">
                {isKnockoutRoundSelected ? formatRoundName(selectedRound) : 'Knockout Bracket'}
              </h3>
            </div>

            {(() => {
              // Group filtered knockout matches by round
              const matchesByRound = filteredKnockoutMatches.reduce((acc, match) => {
                const round = match.round || 'Unknown';
                if (!acc[round]) acc[round] = [];
                acc[round].push(match);
                return acc;
              }, {});

              const roundOrder = ['QF', 'SF', 'F'];
              const availableRounds = roundOrder.filter(r => matchesByRound[r]);

              // Find champion for banner
              const finalMatch = matchesByRound['F']?.[0];
              const championTeamId = finalMatch?.status === 'completed' ? finalMatch.winner_team_id : null;
              const championName = championTeamId
                ? (championTeamId === finalMatch?.team1?.team_id
                  ? (finalMatch.team1?.name || finalMatch.team1?.display_name)
                  : (finalMatch.team2?.name || finalMatch.team2?.display_name))
                : null;

              return (
                <>
                  {/* Champion Banner */}
                  {championName && (
                    <Card className="overflow-hidden border-2 border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 mb-4">
                      <CardContent className="p-4 flex items-center justify-center gap-3">
                        <Trophy className="size-8 text-yellow-500" />
                        <div className="text-center">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-600 dark:text-yellow-400">Champion</p>
                          <p className="text-lg font-black text-yellow-700 dark:text-yellow-300">{championName}</p>
                        </div>
                        <Trophy className="size-8 text-yellow-500" />
                      </CardContent>
                    </Card>
                  )}

                  {availableRounds.map((round) => {
                    const roundMatches = matchesByRound[round] || [];
                    const isFinal = round === 'F';
                    const isSemiFinal = round === 'SF';

                    return (
                      <Card key={round} className={`py-0 gap-0 overflow-hidden mb-3 ${isFinal
                        ? 'border-2 border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10'
                        : isSemiFinal
                          ? 'border-blue-200 bg-blue-50/30 dark:bg-blue-950/10'
                          : ''
                        }`}>
                        <CardHeader className={`py-3 px-4 ${isFinal
                          ? 'bg-gradient-to-r from-primary/20 to-primary/10'
                          : isSemiFinal
                            ? 'bg-blue-100/50 dark:bg-blue-900/20'
                            : 'bg-muted/30'
                          }`}>
                          <CardTitle className={`font-black uppercase tracking-wider flex items-center gap-2 ${isFinal ? 'text-sm' : 'text-xs'
                            }`}>
                            {isFinal && <Trophy className="size-4 text-yellow-500" />}
                            {isSemiFinal && <Zap className="size-3 text-blue-500" />}
                            {formatRoundName(round)}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          {roundMatches.map((match, idx) => {
                            const team1Name = match.team1?.name || match.team1?.display_name || 'TBD';
                            const team2Name = match.team2?.name || match.team2?.display_name || 'TBD';
                            const isComplete = match.status === 'completed';
                            const isLive = match.status === 'in_progress';
                            const winner = match.winner_team_id;
                            const team1Won = winner === match.team1?.team_id;
                            const team2Won = winner === match.team2?.team_id;

                            return (
                              <div key={match.match_id || idx} className={`${isFinal ? 'p-4' : 'p-3'} ${idx > 0 ? 'border-t' : ''} ${isLive ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                                <div className="space-y-2">
                                  <div className={`flex items-center justify-between rounded-lg p-2 ${team1Won
                                    ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
                                    : team2Won
                                      ? 'bg-muted/30 opacity-60'
                                      : 'bg-muted/20'
                                    }`}>
                                    <div className="flex items-center gap-2">
                                      {team1Won && <Crown className="size-4 text-yellow-500" />}
                                      <span className={`${isFinal ? 'text-base font-bold' : 'text-sm font-medium'} ${team1Won ? 'text-green-700 dark:text-green-300' : ''}`}>
                                        {team1Name}
                                      </span>
                                    </div>
                                    {team1Won && <Badge className="bg-green-500 text-white text-[10px]">WINNER</Badge>}
                                  </div>
                                  <div className="flex items-center gap-2 py-1">
                                    <div className="h-px flex-1 bg-border/50" />
                                    <span className={`font-black ${isFinal ? 'text-xs text-primary' : 'text-[10px] text-muted-foreground/50'}`}>VS</span>
                                    <div className="h-px flex-1 bg-border/50" />
                                  </div>
                                  <div className={`flex items-center justify-between rounded-lg p-2 ${team2Won
                                    ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
                                    : team1Won
                                      ? 'bg-muted/30 opacity-60'
                                      : 'bg-muted/20'
                                    }`}>
                                    <div className="flex items-center gap-2">
                                      {team2Won && <Crown className="size-4 text-yellow-500" />}
                                      <span className={`${isFinal ? 'text-base font-bold' : 'text-sm font-medium'} ${team2Won ? 'text-green-700 dark:text-green-300' : ''}`}>
                                        {team2Name}
                                      </span>
                                    </div>
                                    {team2Won && <Badge className="bg-green-500 text-white text-[10px]">WINNER</Badge>}
                                  </div>
                                </div>
                                <div className="mt-3 flex justify-center">
                                  {isLive && <Badge className="text-[10px] bg-red-500 animate-pulse px-3">🔴 LIVE</Badge>}
                                  {isComplete && !isFinal && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">✓ COMPLETE</Badge>}
                                  {!isLive && !isComplete && <Badge variant="outline" className="text-[10px] px-3">UPCOMING</Badge>}
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* Group Standings */}
      {showGroupStandings && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="size-5 text-primary" />
            <h3 className="text-sm font-black uppercase tracking-wider">
              {groupToShow || 'Group Standings'}
            </h3>
          </div>

          {filteredGroupKeys.map((groupKey) => {
            const groupStandings = standings[groupKey] || [];

            return (
              <Card key={groupKey} className="py-0 gap-0 overflow-hidden">
                <CardHeader className="pt-4 px-3 bg-muted/30 ">
                  <CardTitle className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    <Trophy className="size-3" />
                    {groupKey}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-muted/20 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b">
                    <div className="col-span-1">#</div>
                    <div className="col-span-4">Team</div>
                    <div className="col-span-2 text-center">W</div>
                    <div className="col-span-2 text-center">L</div>
                    <div className="col-span-2 text-center">Pts</div>
                    <div className="col-span-1 text-center"></div>
                  </div>

                  {groupStandings.map((team, idx) => {
                    const isFirst = idx === 0;
                    const isSecond = idx === 1;
                    const isQualified = team.qualified;

                    return (
                      <div
                        key={team.team_id}
                        className={`grid grid-cols-12 gap-1 px-3 py-3 items-center ${isQualified ? 'bg-green-50 dark:bg-green-950/20' : ''
                          } ${idx > 0 ? 'border-t' : ''}`}
                      >
                        {/* Rank */}
                        <div className="col-span-1">
                          <div className={`size-6 rounded-full flex items-center justify-center text-xs font-black ${isFirst ? 'bg-yellow-500 text-white' :
                            isSecond ? 'bg-gray-400 text-white' :
                              'bg-muted text-muted-foreground'
                            }`}>
                            {idx + 1}
                          </div>
                        </div>

                        {/* Team Name */}
                        <div className="col-span-4">
                          <p className="font-semibold text-sm truncate">
                            {team.name || team.display_name || `Team ${team.team_id}`}
                          </p>
                          {(team.player1_name || team.player2_name) && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {team.player1_name} & {team.player2_name}
                            </p>
                          )}
                        </div>

                        {/* Wins */}
                        <div className="col-span-2 text-center">
                          <span className="text-sm font-bold text-green-600">{team.wins || 0}</span>
                        </div>

                        {/* Losses */}
                        <div className="col-span-2 text-center">
                          <span className="text-sm font-bold text-red-500">{team.losses || 0}</span>
                        </div>

                        {/* Points Scored */}
                        <div className="col-span-2 text-center">
                          <span className="text-sm font-bold text-blue-600">{team.total_points_scored || 0}</span>
                        </div>

                        {/* Qualified Status */}
                        <div className="col-span-1 text-center">
                          {isQualified ? (
                            <Badge className="text-[10px] bg-green-500 px-1">
                              Q
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">-</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {groupStandings.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No standings yet
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Show knockout bracket at bottom if not in knockout stage but has knockout matches */}
      {!isKnockoutStage && knockoutMatches.length > 0 && renderKnockoutBracket()}
    </div>
  );
}

// Matches List Component for Group+Knockout format
function MatchesList({ matches, stage, selectedRound, selectedGroup, tournamentId, onMatchClick, realtimeScores }) {
  if (!matches || matches.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Trophy className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No matches yet</p>
        <p className="text-sm">Start the first round to generate matches</p>
      </div>
    );
  }

  // Filter matches based on selectedRound and selectedGroup
  let filteredMatches = matches;

  if (selectedRound) {
    if (['QF', 'SF', 'F'].includes(selectedRound)) {
      // Knockout round selected - filter directly by round
      filteredMatches = matches.filter(m => m.round === selectedRound);
    } else {
      // Group stage round selected (e.g., "R1")
      // Match format is GS-{group}-{round}, e.g., GS-A-R1
      filteredMatches = matches.filter(m => {
        if (!m.round || !m.round.startsWith('GS-')) return false;
        const parts = m.round.split('-');
        const matchRoundNum = parts[2]; // R1, R2, etc.
        const matchGroup = parts[1]; // A, B, etc.

        const matchesRound = matchRoundNum === selectedRound;
        const matchesGroup = selectedGroup === 'all' || matchGroup === selectedGroup;

        return matchesRound && matchesGroup;
      });
    }
  } else if (selectedGroup && selectedGroup !== 'all') {
    // No round selected but group is selected
    filteredMatches = matches.filter(m => {
      if (!m.round || !m.round.startsWith('GS-')) return true; // Keep knockout matches
      const parts = m.round.split('-');
      return parts[1] === selectedGroup;
    });
  }

  return (
    <div className="space-y-3">
      {filteredMatches.map((match) => {
        const team1Name = match.team1?.name || match.team1?.display_name ||
          (match.team1?.team_id ? `Team ${match.team1.team_id}` : 'TBD');
        const team2Name = match.team2?.name || match.team2?.display_name ||
          (match.team2?.team_id ? `Team ${match.team2.team_id}` : 'TBD');
        const matchId = match.match_id || match.id;
        const isLive = match.status === 'in_progress';
        const isComplete = match.status === 'completed';

        // Get realtime scores if available
        const liveScores = realtimeScores?.[matchId];
        const scoreA = liveScores?.teamA ?? null;
        const scoreB = liveScores?.teamB ?? null;
        const winRate = liveScores?.winRate ?? null;

        return (
          <Card
            key={matchId}
            className={`overflow-hidden py-0 cursor-pointer hover:border-primary/50 transition-all group ${isLive ? 'border-red-500/30' : ''
              }`}
            onClick={() => onMatchClick && onMatchClick(match.tournament_id || tournamentId, match.round, matchId)}
          >
            <div className="flex">
              {/* Status Indicator */}
              <div className={`w-1.5 ${isLive ? 'bg-red-500' :
                isComplete ? 'bg-green-500' :
                  'bg-yellow-500'
                }`} />

              <div className="flex-1 p-3">
                {/* Round & Status Header */}
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                    {formatRoundName(match.round)}
                  </span>
                  <div className="flex items-center gap-2">
                    {isLive && (
                      <span className="flex items-center gap-1 text-[10px] font-black text-red-600 uppercase animate-pulse">
                        <span className="relative flex size-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                          <span className="relative inline-flex rounded-full size-2 bg-red-500"></span>
                        </span>
                        LIVE
                      </span>
                    )}
                    {isComplete && (
                      <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                        DONE
                      </Badge>
                    )}
                    {!isLive && !isComplete && (
                      <Badge variant="outline" className="text-[10px]">
                        PENDING
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Teams */}
                <div className="space-y-1 mb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="size-6 bg-brand-blue/10 rounded-full flex items-center justify-center text-brand-blue font-black text-[10px]">
                        A
                      </div>
                      <span className={`font-medium text-sm ${match.winner_team_id === match.team1?.team_id ? 'text-green-600 font-bold' : ''
                        }`}>
                        {team1Name}
                      </span>
                      {match.winner_team_id === match.team1?.team_id && (
                        <Crown className="h-3 w-3 text-yellow-500" />
                      )}
                    </div>
                    {/* Live Score for Team A */}
                    {scoreA !== null && (
                      <span className="text-lg font-black tabular-nums text-brand-blue">{scoreA}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="size-6 bg-brand-green/10 rounded-full flex items-center justify-center text-brand-green font-black text-[10px]">
                        B
                      </div>
                      <span className={`font-medium text-sm ${match.winner_team_id === match.team2?.team_id ? 'text-green-600 font-bold' : ''
                        }`}>
                        {team2Name}
                      </span>
                      {match.winner_team_id === match.team2?.team_id && (
                        <Crown className="h-3 w-3 text-yellow-500" />
                      )}
                    </div>
                    {/* Live Score for Team B */}
                    {scoreB !== null && (
                      <span className="text-lg font-black tabular-nums text-brand-green">{scoreB}</span>
                    )}
                  </div>
                </div>

                {/* View Match Button */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {match.court ? `Court ${match.court}` : ''}
                  </span>
                  <div className="flex items-center gap-1 text-xs font-medium text-primary">
                    {isLive ? 'View Live' : 'View Details'}
                    <ChevronRight className="size-3" />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function TournamentStatsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("matches");
  const [selectedRound, setSelectedRound] = useState("1");
  const [selectedMatchRound, setSelectedMatchRound] = useState(null); // null = show all
  const [selectedGroup, setSelectedGroup] = useState('all'); // 'all', 'A', 'B', etc.
  const [realtimeScores, setRealtimeScores] = useState({});
  const wsConnectionsRef = useRef({});

  const { data: tournament, isLoading: tournamentLoading } = useTournament(
    params.id
  );
  const { data: roundsData, isLoading: roundsLoading } = useTournamentRounds(
    params.id
  );
  const { data: roundData, isLoading: roundLoading } = useTournamentRound(
    params.id,
    selectedRound
  );

  // Tournament Engine data for Group+Knockout format
  const {
    info: engineInfo,
    standings: engineStandings,
    teams: engineTeams,
    matches: engineMatches,
    isLoading: engineLoading,
    isGroupKnockout,
    refetchStandings,
    refetchMatches
  } = useTournamentEngine(params.id);

  // Determine tournament format - must be before conditional returns
  const tournamentFormat = useMemo(() => {
    if (!tournament) return 'swiss';
    let metadata = tournament.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (e) {
        metadata = {};
      }
    }
    return metadata?.format || 'swiss';
  }, [tournament]);

  const isGroupKnockoutFormat = tournamentFormat === 'group_knockout' || isGroupKnockout;

  // Generate rounds for Group+Knockout format - must be before conditional returns
  const groupKnockoutRounds = useMemo(() => {
    if (!isGroupKnockoutFormat || !engineInfo) return [];

    const rounds = [];
    const totalGroupRounds = engineInfo.total_group_rounds || 0;

    // Add group stage rounds
    for (let i = 1; i <= totalGroupRounds; i++) {
      rounds.push(`${i}`);
    }

    // Add knockout rounds based on teams advancing
    const teamsAdvancing = (engineInfo.number_of_groups || 2) * (engineInfo.teams_to_advance || 2);
    if (teamsAdvancing >= 8) rounds.push('QF');
    if (teamsAdvancing >= 4) rounds.push('SF');
    rounds.push('F');

    return rounds;
  }, [isGroupKnockoutFormat, engineInfo]);

  // Get unique rounds from matches for Group+Knockout - must be before conditional returns
  const availableMatchRounds = useMemo(() => {
    if (!engineMatches || engineMatches.length === 0) return [];
    const rounds = [...new Set(engineMatches.map(m => m.round).filter(Boolean))];

    // Sort: GS-* first, then knockout rounds
    const knockoutOrder = { 'QF': 1, 'SF': 2, 'F': 3 };
    return rounds.sort((a, b) => {
      const isGroupA = a.startsWith('GS-');
      const isGroupB = b.startsWith('GS-');
      if (isGroupA && isGroupB) return a.localeCompare(b);
      if (isGroupA) return -1;
      if (isGroupB) return 1;
      const orderA = knockoutOrder[a] || 0;
      const orderB = knockoutOrder[b] || 0;
      return orderA - orderB;
    });
  }, [engineMatches]);

  // Extract unique round numbers (R1, R2, etc.) and available groups
  const { roundNumbers, availableGroups, knockoutRounds } = useMemo(() => {
    if (!availableMatchRounds.length) return { roundNumbers: [], availableGroups: [], knockoutRounds: [] };

    const roundNums = new Set();
    const groups = new Set();
    const knockouts = [];

    availableMatchRounds.forEach(round => {
      if (round.startsWith('GS-')) {
        // GS-A-R1 -> extract R1 and group A
        const parts = round.split('-');
        if (parts.length >= 3) {
          groups.add(parts[1]); // A, B, etc.
          roundNums.add(parts[2]); // R1, R2, etc.
        }
      } else {
        // Knockout rounds: QF, SF, F
        knockouts.push(round);
      }
    });

    return {
      roundNumbers: Array.from(roundNums).sort(),
      availableGroups: Array.from(groups).sort(),
      knockoutRounds: knockouts
    };
  }, [availableMatchRounds]);

  // WebSocket connection for tournament updates (match status changes)
  useEffect(() => {
    if (!params.id) return;

    const ws = createWebSocketConnection(`/ws/tournament/${params.id}/updates`, {
      onMessage: (data) => {
        if (data.type === "match_start" || data.type === "match_complete" || data.type === "match_update") {
          // Invalidate queries to refresh match status
          queryClient.invalidateQueries({ queryKey: ["tournament-engine"] }); // Refresh all engine data
          queryClient.invalidateQueries({ queryKey: ["referee-matches"] }); // Refresh referee view too
        }
      },
      onOpen: () => console.log("Tournament VS connected"),
      reconnect: true,
    });

    return () => {
      if (ws) ws.close();
    };
  }, [params.id, queryClient]);

  // WebSocket connections for live score updates - must be before conditional returns
  useEffect(() => {
    if (!engineMatches || engineMatches.length === 0) {
      setRealtimeScores({});
      return;
    }

    // Clean up existing connections
    Object.values(wsConnectionsRef.current).forEach((ws) => {
      if (ws && ws.close) ws.close();
    });
    wsConnectionsRef.current = {};
    setRealtimeScores({});

    // Create WebSocket connection for each match
    engineMatches.forEach((match) => {
      const matchId = match.match_id || match.id;
      if (!matchId) return;

      const ws = createWebSocketConnection(`/ws/match/${matchId}/score`, {
        onMessage: (data) => {
          if (data.type === "score_update") {
            setRealtimeScores((prev) => ({
              ...prev,
              [matchId]: {
                teamA: data.teamA,
                teamB: data.teamB,
                winRate: data.winRate,
              },
            }));
          }
        },
        reconnect: true,
      });

      wsConnectionsRef.current[matchId] = ws;
    });

    return () => {
      Object.values(wsConnectionsRef.current).forEach((ws) => {
        if (ws && ws.close) ws.close();
      });
      wsConnectionsRef.current = {};
    };
  }, [engineMatches?.length]);

  // Tournament-level WebSocket for standings/pairings updates
  useEffect(() => {
    if (!params.id) return;

    const tournamentWs = createWebSocketConnection(`/ws/tournament/${params.id}/updates`, {
      onMessage: (data) => {
        if (data.type === 'standings_update') {
          // Refetch standings when match completes
          if (refetchStandings) refetchStandings();
          console.log('📡 Standings update received, refetching...');
        }
        if (data.type === 'pairings_generated') {
          // Refetch matches when new pairings generated
          if (refetchMatches) refetchMatches();
          console.log('📡 Pairings generated, refetching matches...');
        }
      },
      reconnect: true,
    });

    return () => {
      if (tournamentWs && tournamentWs.close) tournamentWs.close();
    };
  }, [params.id, refetchStandings, refetchMatches]);

  // Auto-select latest round when matches load
  useEffect(() => {
    if (availableMatchRounds.length > 0 && selectedMatchRound === null) {
      // Priority: F > SF > QF > Latest Round
      if (availableMatchRounds.includes('F')) {
        setSelectedMatchRound('F');
      } else if (availableMatchRounds.includes('SF')) {
        setSelectedMatchRound('SF');
      } else if (availableMatchRounds.includes('QF')) {
        setSelectedMatchRound('QF');
      } else {
        // Fallback to the last round (most recent)
        const lastRound = availableMatchRounds[availableMatchRounds.length - 1];

        // If it's a group round (e.g. GS-A-R2), extract the round number (R2)
        if (lastRound && lastRound.startsWith('GS-')) {
          const parts = lastRound.split('-');
          if (parts.length >= 3) {
            setSelectedMatchRound(parts[2]);
            return;
          }
        }

        setSelectedMatchRound(lastRound);
      }
    }
  }, [availableMatchRounds, selectedMatchRound]);

  if (tournamentLoading) {
    return (
      <div className="pb-20">
        <div className="p-4 text-center">Loading tournament...</div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="pb-20">
        <div className="p-4 text-center">Tournament not found</div>
      </div>
    );
  }

  const category = getTournamentCategory(tournament.match_format);

  // Swiss format data
  const pairings = roundData?.round?.pairings || [];
  const leaderboard = roundData?.round?.leaderboard || [];

  // Group pairings by court (Swiss format)
  const pairingsByCourt = pairings.reduce((acc, pairing) => {
    const court = pairing.court || "Unknown";
    if (!acc[court]) acc[court] = [];
    acc[court].push(pairing);
    return acc;
  }, {});

  // Get top 3 and remaining players (Swiss format)
  const topThree = leaderboard.slice(0, 3);
  const remaining = leaderboard.slice(3);

  // Get rounds from API endpoint (parsed from metadata)
  const rounds = roundsData?.rounds || [];

  // Fallback: Generate rounds based on total_rounds if API data not available
  const fallbackRounds = [];
  if (rounds.length === 0 && !roundsLoading) {
    const totalRounds = tournament.match_format?.total_rounds || 7;
    // Add numbered rounds (1-4)
    for (let i = 1; i <= Math.min(totalRounds, 4); i++) {
      fallbackRounds.push(String(i));
    }
    // Add special rounds only if they don't conflict with numbered rounds
    if (totalRounds >= 5 && !fallbackRounds.includes("4")) fallbackRounds.push("4");
    if (totalRounds >= 6) fallbackRounds.push("8");
    if (totalRounds >= 7) fallbackRounds.push("16");
  }

  const displayRounds = rounds.length > 0 ? rounds : fallbackRounds;

  // Handle match click - navigate to match detail page
  const handleMatchClick = (tournamentId, round, matchId) => {
    router.push(`/tournaments/${tournamentId}/${round}/${matchId}`);
  };

  // Render Group+Knockout format
  if (isGroupKnockoutFormat) {
    return (
      <ScrollablePage className="bg-background">
        <ScrollablePageHeader className="pb-0 bg-transparent">
          <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
            <TournamentStatsHeader
              tournamentName={tournament.name}
              category={category}
            />
            {/* Round Navigation */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-2 pt-1 border-b border-border/50">
              <div className="container px-4 mx-auto space-y-3">
                <ScrollArea className="w-full whitespace-nowrap">
                  <div className="flex w-max space-x-2 py-1">
                    {roundNumbers.map((round) => {
                      const displayName = formatRoundName(round).replace('Round ', 'R');
                      const isSelected = selectedMatchRound === round;

                      return (
                        <Button
                          key={round}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setSelectedMatchRound(round);
                            // Default to 'all' groups when switching info group rounds
                            if (round.startsWith('GS-') && availableGroups.length > 0) {
                              setSelectedGroup('all');
                            }
                          }}
                          className="text-xs font-bold shrink-0"
                        >
                          {displayName}
                        </Button>
                      );
                    })}

                    {/* Separator if we have both group and knockout rounds */}
                    {roundNumbers.length > 0 && knockoutRounds.length > 0 && (
                      <div className="w-px h-6 bg-border mx-1 self-center" />
                    )}

                    {knockoutRounds.map((round) => {
                      const isSelected = selectedMatchRound === round;
                      const displayName = round; // QF, SF, F

                      return (
                        <Button
                          key={round}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setSelectedMatchRound(round);
                            setSelectedGroup('all'); // No group filter for knockout
                          }}
                          className={`text-xs font-bold shrink-0 ${round === 'F' ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border-yellow-500/30' : ''
                            }`}
                        >
                          {round === 'F' && <Trophy className="size-3 mr-1" />}
                          {displayName}
                        </Button>
                      );
                    })}
                  </div>
                </ScrollArea>

                {/* Group Toggle - Only show for group stage rounds */}
                {selectedMatchRound && !['QF', 'SF', 'F'].includes(selectedMatchRound) && availableGroups.length > 1 && (
                  <div className="flex justify-center pb-1">
                    <div className="flex items-center p-1 bg-muted/50 rounded-lg border border-border/50">
                      <Button
                        variant={selectedGroup === 'all' ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setSelectedGroup('all')}
                        className={`text-[10px] font-bold h-7 px-4 rounded-md transition-all ${selectedGroup === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        All Groups
                      </Button>
                      {availableGroups.map((group) => (
                        <Button
                          key={group}
                          variant={selectedGroup === group ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => setSelectedGroup(group)}
                          className={`text-[10px] font-bold h-7 px-4 rounded-md transition-all ${selectedGroup === group ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          Group {group}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>
        </ScrollablePageHeader>

        <ScrollablePageContent className="pb-24 pt-4">
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
            <div className="px-4 mb-4">
              <TabsList className="w-full h-12 p-1.5 bg-muted/30 border rounded-xl grid grid-cols-2">
                <TabsTrigger
                  value="matches"
                  className="rounded-lg text-xs font-bold uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
                >
                  Matches
                </TabsTrigger>
                <TabsTrigger
                  value="leaderboard"
                  className="rounded-lg text-xs font-bold uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
                >
                  Standings
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Content */}
            <div className="flex-1 px-4">
              <TabsContent value="matches" className="mt-0 space-y-4">
                {engineLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading matches...
                  </div>
                ) : (
                  <MatchesList
                    matches={engineMatches}
                    stage={engineInfo?.stage}
                    selectedRound={selectedMatchRound}
                    selectedGroup={selectedGroup}
                    tournamentId={params.id}
                    onMatchClick={handleMatchClick}
                    realtimeScores={realtimeScores}
                  />
                )}
              </TabsContent>
              <TabsContent value="leaderboard" className="mt-0 space-y-4">
                {engineLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading standings...
                  </div>
                ) : (
                  <GroupStandings
                    standings={engineStandings}
                    groups={engineInfo?.groups}
                    teams={engineTeams?.teams}
                    engineInfo={engineInfo}
                    matches={engineMatches}
                    selectedRound={selectedMatchRound}
                    selectedGroup={selectedGroup}
                  />
                )}
              </TabsContent>
            </div>
          </Tabs>
        </ScrollablePageContent>
      </ScrollablePage>
    );
  }

  // Render Swiss format (original)
  return (
    <ScrollablePage className="bg-background">
      <ScrollablePageHeader className="pb-0 bg-transparent">
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
          <TournamentStatsHeader
            tournamentName={tournament.name}
            category={category}
          />
          <div className="px-0 pb-2">
            <RoundNavigation
              rounds={displayRounds}
              selectedRound={selectedRound}
              onRoundChange={setSelectedRound}
            />
          </div>
        </header>
      </ScrollablePageHeader>

      <ScrollablePageContent className="pb-24 pt-4">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
          <div className="px-4 mb-4">
            <TabsList className="w-full h-12 p-1.5 bg-muted/30 rounded-xl grid grid-cols-2">
              <TabsTrigger
                value="pairings"
                className="rounded-lg text-xs font-bold uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
              >
                Pairings
              </TabsTrigger>
              <TabsTrigger
                value="leaderboard"
                className="rounded-lg text-xs font-bold uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
              >
                Leaderboard
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Content */}
          <div className="flex-1 px-4">
            <TabsContent value="pairings" className="mt-0 space-y-4">
              <PairingsTab
                pairingsByCourt={pairingsByCourt}
                selectedRound={selectedRound}
                isLoading={roundLoading}
              />
            </TabsContent>
            <TabsContent value="leaderboard" className="mt-0 space-y-4">
              <LeaderboardTab
                topThree={topThree}
                remaining={remaining}
                isLoading={roundLoading}
              />
            </TabsContent>
          </div>
        </Tabs>
      </ScrollablePageContent>
    </ScrollablePage>
  );
}
