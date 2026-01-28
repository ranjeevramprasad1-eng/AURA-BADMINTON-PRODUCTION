'use client';

/**
 * ScoreDisplay Component
 * Displays match score with team information
 */
export function ScoreDisplay({ teamA, teamB, teamAScore, teamBScore }) {
  return (
    <div className="w-full">
      <div className="relative grid grid-cols-2 gap-8 md:gap-12 mb-16">
        {/* Team A */}
        <TeamSection
          team={teamA}
          score={teamAScore}
          teamLabel="A"
          teamColor="primary"
        />

        {/* VS Divider */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="text-4xl md:text-6xl font-black text-muted-foreground/20">VS</div>
        </div>

        {/* Team B */}
        <TeamSection
          team={teamB}
          score={teamBScore}
          teamLabel="B"
          teamColor="destructive"
        />
      </div>
    </div>
  );
}

function TeamSection({ team, score, teamLabel, teamColor }) {
  const colorClasses = {
    primary: 'bg-primary/20 border-primary text-primary',
    destructive: 'bg-destructive/20 border-destructive text-destructive',
  };

  const classes = colorClasses[teamColor] || colorClasses.primary;

  return (
    <div className="text-center">
      <div className="mb-6">
        <div className={`${classes} border-2 rounded-full size-24 md:size-32 flex items-center justify-center mb-4 mx-auto`}>
          <span className={`text-4xl md:text-6xl font-black ${teamColor === 'primary' ? 'text-primary' : 'text-destructive'}`}>
            {teamLabel}
          </span>
        </div>
      </div>
      <div className="space-y-3 md:space-y-4">
        {team.length > 0 ? (
          team.map((player, idx) => (
            <PlayerCard key={idx} player={player} />
          ))
        ) : (
          <h3 className="text-2xl md:text-3xl font-black italic tracking-tighter text-muted-foreground">
            Team {teamLabel}
          </h3>
        )}
      </div>
      <div className="mt-8 md:mt-12">
        <div className={`text-7xl md:text-9xl font-black tabular-nums ${teamColor === 'primary' ? 'text-primary' : 'text-destructive'}`}>
          {score}
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ player }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      {player.photo ? (
        <img
          src={player.photo}
          alt={player.name}
          className="size-16 md:size-20 rounded-full border-2 border-border object-cover"
        />
      ) : (
        <div className="size-16 md:size-20 rounded-full border-2 border-border bg-muted/20 flex items-center justify-center">
          <span className="text-2xl md:text-3xl font-black text-foreground">
            {player.name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <h3 className="text-xl md:text-3xl font-black italic tracking-tighter text-foreground">
        {player.name}
      </h3>
    </div>
  );
}
