'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Crown, Zap } from 'lucide-react';
import { formatRoundName, groupMatchesByRound, getTournamentChampion } from '@/lib/utils/tournament';

/**
 * KnockoutBracket Component
 * Displays knockout bracket matches
 */
export function KnockoutBracket({ matches }) {
  if (!matches || matches.length === 0) return null;

  const matchesByRound = groupMatchesByRound(matches);
  const roundOrder = ['QF', 'SF', 'F'];
  const availableRounds = roundOrder.filter(r => matchesByRound[r]);
  const championName = getTournamentChampion(matchesByRound);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-2">
        <Trophy className="size-4 text-primary" />
        <h3 className="text-xs font-black uppercase tracking-wider">Knockout Bracket</h3>
      </div>

      {championName && <ChampionBanner championName={championName} />}

      {availableRounds.map((round) => (
        <RoundCard
          key={round}
          round={round}
          matches={matchesByRound[round] || []}
        />
      ))}
    </div>
  );
}

function ChampionBanner({ championName }) {
  return (
    <Card className="overflow-hidden border-2 border-yellow-400 bg-linear-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 mb-2">
      <CardContent className="p-3 flex items-center justify-center gap-2">
        <Trophy className="size-6 text-yellow-500" />
        <div className="text-center">
          <p className="text-[9px] font-bold uppercase tracking-wider text-yellow-600 dark:text-yellow-400">
            Champion
          </p>
          <p className="text-sm font-black text-yellow-700 dark:text-yellow-300">
            {championName}
          </p>
        </div>
        <Trophy className="size-6 text-yellow-500" />
      </CardContent>
    </Card>
  );
}

function RoundCard({ round, matches }) {
  const isFinal = round === 'F';
  const isSemiFinal = round === 'SF';

  const cardClass = isFinal
    ? 'border-2 border-primary/50 bg-linear-to-br from-primary/5 to-primary/10'
    : isSemiFinal
      ? 'border-blue-200 bg-blue-50/30 dark:bg-blue-950/10'
      : '';

  const headerClass = isFinal
    ? 'bg-linear-to-r from-primary/20 to-primary/10'
    : isSemiFinal
      ? 'bg-blue-100/50 dark:bg-blue-900/20'
      : 'bg-muted/30';

  return (
    <Card className={`overflow-hidden ${cardClass}`}>
      <CardHeader className={`py-2 px-3 ${headerClass}`}>
        <CardTitle className={`font-black uppercase tracking-wider flex items-center gap-2 ${
          isFinal ? 'text-xs' : 'text-[10px]'
        }`}>
          {isFinal && <Trophy className="size-3 text-yellow-500" />}
          {isSemiFinal && <Zap className="size-3 text-blue-500" />}
          {formatRoundName(round)}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {matches.map((match, idx) => (
          <MatchCard
            key={match.match_id || idx}
            match={match}
            isFinal={isFinal}
            isFirst={idx === 0}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function MatchCard({ match, isFinal, isFirst }) {
  const team1Name = match.team1?.name || match.team1?.display_name || 'TBD';
  const team2Name = match.team2?.name || match.team2?.display_name || 'TBD';
  const isComplete = match.status === 'completed';
  const isLive = match.status === 'in_progress';
  const winner = match.winner_team_id;
  const team1Won = winner === match.team1?.team_id;
  const team2Won = winner === match.team2?.team_id;

  return (
    <div className={`${isFinal ? 'p-3' : 'p-2'} ${!isFirst ? 'border-t' : ''} ${
      isLive ? 'bg-red-50 dark:bg-red-950/20' : ''
    }`}>
      <div className={isFinal ? 'space-y-2' : 'space-y-1.5'}>
        <TeamRow
          teamName={team1Name}
          isWinner={team1Won}
          isFinal={isFinal}
        />
        <VsDivider isFinal={isFinal} />
        <TeamRow
          teamName={team2Name}
          isWinner={team2Won}
          isFinal={isFinal}
        />
      </div>
      <MatchStatus isLive={isLive} isComplete={isComplete} isFinal={isFinal} />
    </div>
  );
}

function TeamRow({ teamName, isWinner, isFinal }) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg p-1.5 ${
        isWinner
          ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
          : 'bg-muted/20'
      }`}
    >
      <div className="flex items-center gap-1.5">
        {isWinner && <Crown className="size-3 text-yellow-500" />}
        <span
          className={`${isFinal ? 'text-sm font-bold' : 'text-xs font-medium'} ${
            isWinner ? 'text-green-700 dark:text-green-300' : ''
          }`}
        >
          {teamName}
        </span>
      </div>
      {isWinner && <Badge className="bg-green-500 text-white text-[9px]">WIN</Badge>}
    </div>
  );
}

function VsDivider({ isFinal }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <div className="h-px flex-1 bg-border/50" />
      <span
        className={`font-black ${
          isFinal ? 'text-[10px] text-primary' : 'text-[9px] text-muted-foreground/50'
        }`}
      >
        VS
      </span>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}

function MatchStatus({ isLive, isComplete, isFinal }) {
  return (
    <div className="mt-2 flex justify-center">
      {isLive && (
        <Badge className="text-[9px] bg-red-500 animate-pulse px-2">🔴 LIVE</Badge>
      )}
      {isComplete && !isFinal && (
        <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700 border-green-200">
          ✓
        </Badge>
      )}
    </div>
  );
}
