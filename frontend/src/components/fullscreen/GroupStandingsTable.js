'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy } from 'lucide-react';

/**
 * GroupStandingsTable Component
 * Displays standings for a single group
 */
export function GroupStandingsTable({ groupKey, standings }) {
  if (!standings || standings.length === 0) {
    return (
      <Card className="py-0 gap-0 overflow-hidden">
        <CardHeader className="pt-4 px-4 bg-muted/30">
          <CardTitle className="text-base font-black uppercase tracking-wider flex items-center gap-2">
            <Trophy className="size-5" />
            {groupKey}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 text-center text-muted-foreground text-sm">
          No standings yet
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-8 text-3xl font-black uppercase tracking-wider flex items-center gap-2">
        <Trophy className="size-8" />
        {groupKey}
      </div>
      <Card className="py-0 gap-0 overflow-hidden rounded-none">

        <CardContent className="p-0">
          <StandingsTableHeader />
          {standings.map((team, idx) => (
            <StandingsTableRow
              key={team.team_id}
              team={team}
              rank={idx + 1}
              isFirst={idx === 0}
              isSecond={idx === 1}
            />
          ))}
        </CardContent>
      </Card>
    </div>

  );
}

function StandingsTableHeader() {
  return (
    <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-muted/20 text-sm font-bold uppercase tracking-wider text-muted-foreground border-b">
      <div className="col-span-1">#</div>
      <div className="col-span-4">Team</div>
      <div className="col-span-2 text-center">W</div>
      <div className="col-span-2 text-center">L</div>
      <div className="col-span-2 text-center">Pts</div>
      <div className="col-span-1 text-center"></div>
    </div>
  );
}

function StandingsTableRow({ team, rank, isFirst, isSecond }) {
  const rankBadgeClass = isFirst
    ? 'bg-yellow-500 text-white'
    : isSecond
      ? 'bg-gray-400 text-white'
      : 'bg-muted text-muted-foreground';

  return (
    <div
      className={`grid grid-cols-12 gap-2 px-4 py-3 items-center ${team.qualified ? 'bg-green-50 dark:bg-green-950/20' : ''
        } ${rank > 1 ? 'border-t' : ''}`}
    >
      {/* Rank */}
      <div className="col-span-1">
        <div className={`size-8 rounded-full flex items-center justify-center text-sm font-black ${rankBadgeClass}`}>
          {rank}
        </div>
      </div>

      {/* Team Name */}
      <div className="col-span-4">
        <p className="font-semibold text-base truncate">
          {team.name || team.display_name || `Team ${team.team_id}`}
        </p>
        {(team.player1_name || team.player2_name) && (
          <p className="text-xs text-muted-foreground truncate">
            {team.player1_name} & {team.player2_name}
          </p>
        )}
      </div>

      {/* Wins */}
      <div className="col-span-2 text-center">
        <span className="text-base font-bold text-green-600">{team.wins || 0}</span>
      </div>

      {/* Losses */}
      <div className="col-span-2 text-center">
        <span className="text-base font-bold text-red-500">{team.losses || 0}</span>
      </div>

      {/* Points Scored */}
      <div className="col-span-2 text-center">
        <span className="text-base font-bold text-blue-600">{team.total_points_scored || 0}</span>
      </div>

      {/* Qualified Status */}
      <div className="col-span-1 text-center">
        {team.qualified ? (
          <Badge className="text-xs bg-green-500 px-2 py-1">Q</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </div>
    </div>
  );
}
