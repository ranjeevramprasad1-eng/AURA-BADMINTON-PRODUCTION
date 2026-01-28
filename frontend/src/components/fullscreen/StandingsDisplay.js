'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Target } from 'lucide-react';
import { GroupStandingsTable } from './GroupStandingsTable';
import { KnockoutBracket } from './KnockoutBracket';
import { getKnockoutMatches, getGroupKeys } from '@/lib/utils/tournament';

/**
 * StandingsDisplay Component (Composite Pattern)
 * Composes multiple display components together
 */
export function StandingsDisplay({ standings, matches, currentGroupKey }) {
  const knockoutMatches = getKnockoutMatches(matches);
  const allGroupKeys = getGroupKeys(standings);

  // Filter to show only the current group if specified
  const groupKeys = currentGroupKey
    ? allGroupKeys.filter(key => key === currentGroupKey)
    : allGroupKeys;

  // Show message if no standings and no knockout matches
  if (allGroupKeys.length === 0 && knockoutMatches.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Target className="size-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No standings available yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pr-2">
        {/* Group Standings Section */}
        {groupKeys.length > 0 && (
          <GroupStandingsSection
            groupKeys={groupKeys}
            standings={standings}
            currentGroupKey={currentGroupKey}
          />
        )}

        {/* Knockout Bracket Section */}
        {knockoutMatches.length > 0 && (
          <KnockoutBracket matches={knockoutMatches} />
        )}
      </div>
    </ScrollArea>
  );
}

/**
 * GroupStandingsSection Component
 * Displays group standings with optional filtering
 */
function GroupStandingsSection({ groupKeys, standings, currentGroupKey }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Target className="size-4 text-primary" />
        <h3 className="text-sm font-bold italic text-muted-foreground uppercase tracking-wider">Group Standings</h3>
      </div>

      {groupKeys.map((groupKey) => (
        <GroupStandingsTable
          key={groupKey}
          groupKey={groupKey}
          standings={standings[groupKey] || []}
        />
      ))}
    </div>
  );
}
