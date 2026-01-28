/**
 * Tournament utility functions
 */

/**
 * Format round name for display
 * @param {string} round - Round identifier
 * @returns {string} Formatted round name
 */
export function formatRoundName(round) {
  if (!round) return '';
  if (round === 'QF') return 'Quarter Finals';
  if (round === 'SF') return 'Semi Finals';
  if (round === 'F') return 'Final';
  return round;
}

/**
 * Get knockout matches from all matches
 * @param {Array} matches - All matches
 * @returns {Array} Knockout matches
 */
export function getKnockoutMatches(matches) {
  if (!matches) return [];
  return matches.filter(m => 
    m.round === 'QF' || m.round === 'SF' || m.round === 'F'
  );
}

/**
 * Group matches by round
 * @param {Array} matches - Matches to group
 * @returns {Object} Matches grouped by round
 */
export function groupMatchesByRound(matches) {
  if (!matches) return {};
  
  return matches.reduce((acc, match) => {
    const round = match.round || 'Unknown';
    if (!acc[round]) acc[round] = [];
    acc[round].push(match);
    return acc;
  }, {});
}

/**
 * Get tournament champion from matches
 * @param {Object} matchesByRound - Matches grouped by round
 * @returns {string|null} Champion name or null
 */
export function getTournamentChampion(matchesByRound) {
  const finalMatch = matchesByRound['F']?.[0];
  if (!finalMatch || finalMatch.status !== 'completed') return null;
  
  const championTeamId = finalMatch.winner_team_id;
  if (!championTeamId) return null;
  
  return championTeamId === finalMatch.team1?.team_id
    ? (finalMatch.team1?.name || finalMatch.team1?.display_name)
    : (finalMatch.team2?.name || finalMatch.team2?.display_name);
}

/**
 * Get sorted group keys from standings
 * @param {Object} standings - Standings object
 * @returns {Array} Sorted group keys
 */
export function getGroupKeys(standings) {
  if (!standings) return [];
  return Object.keys(standings).sort();
}
