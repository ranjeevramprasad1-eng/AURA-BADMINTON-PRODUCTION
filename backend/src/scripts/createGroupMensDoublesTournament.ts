import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

interface Team {
  team_id: number;
}

interface Registration {
  id: number;
  tournament_id: number;
  player_id: number;
}

const PLAYER_COUNT = 18; //without host and referee
const GAME_ID = 2; //1: pickleball, 2: badminton


/**
 * Creates a group mixed doubles tournament with 14 players
 * - First player becomes host and referee (not in any team)
 * - Second player becomes referee (not in any team)
 * - Remaining 12 players form 6 teams (2 players each)
 * - All teams are automatically registered
 */
async function createGroupMensDoublesTournament() {
  try {
    console.log('🏸 Starting tournament creation...\n');

    // Step 1: Fetch players (PLAYER_COUNT for teams + 1 host + 1 referee)
    console.log(`📋 Fetching ${PLAYER_COUNT + 2} players...`);
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, username, user_id')
      .limit(PLAYER_COUNT + 2)
      .order('id', { ascending: true });

    if (playersError) {
      throw new Error(`Failed to fetch players: ${playersError.message}`);
    }

    if (!players || players.length < PLAYER_COUNT + 2) {
      throw new Error(`Not enough players. Found ${players?.length || 0}, need ${PLAYER_COUNT + 2} (PLAYER_COUNT for teams + 1 host + 1 referee).`);
    }

    console.log(`✅ Found ${players.length} players\n`);

    // Step 2: Get first available venue
    console.log('📍 Fetching venue...');
    const { data: venues, error: venueError } = await supabase
      .from('venue')
      .select('id, name, address')
      .limit(1)
      .order('id', { ascending: true });

    if (venueError) {
      throw new Error(`Failed to fetch venue: ${venueError.message}`);
    }

    if (!venues || venues.length === 0) {
      throw new Error('No venues found. Please create a venue first.');
    }

    const venue = venues[0];
    console.log(`✅ Using venue: ${venue.name} (ID: ${venue.id})\n`);

    // Step 3: Assign roles
    const hostPlayer = players[0];
    const refereePlayer = players[1];
    const playingPlayers = players.slice(2); // Remaining PLAYER_COUNT players for teams

    console.log(`👑 Host: ${hostPlayer.username || `Player ${hostPlayer.id}`} (ID: ${hostPlayer.id})`);
    console.log(`⚖️  Referee: ${refereePlayer.username || `Player ${refereePlayer.id}`} (ID: ${refereePlayer.id})`);
    console.log(`👥 Playing players: ${playingPlayers.length} (will form 6 teams)\n`);

    // Step 4: Create match format (mixed_doubles)
    console.log('🎾 Creating match format...');
    const { data: matchFormat, error: matchFormatError } = await supabase
      .from('match_format')
      .insert({
        type: 'mixed_doubles',
        eligible_gender: 'MW',
        min_age: null,
        max_age: null,
        total_rounds: 0,
        metadata: {
          set_rules: {
            final: { best_of: 7 },
            semi_final: { best_of: 5 },
            league: { _rounds: 4, best_of: 3 },
          },
        },
      })
      .select()
      .single();

    if (matchFormatError || !matchFormat) {
      throw new Error(`Failed to create match format: ${matchFormatError?.message || 'Unknown error'}`);
    }

    console.log(`✅ Created match format (ID: ${matchFormat.id})\n`);

    // Step 5: Check and delete existing tournament if it exists
    const tournamentName = 'Badminton Group Mixed Doubles Tournament';
    console.log('🔍 Checking for existing tournament...');
    const { data: existingTournaments, error: checkError } = await supabase
      .from('tournaments')
      .select('id')
      .eq('name', tournamentName)
      .eq('game_id', GAME_ID);

    if (checkError) {
      throw new Error(`Failed to check for existing tournament: ${checkError.message}`);
    }

    if (existingTournaments && existingTournaments.length > 0) {
      console.log(`⚠️  Found ${existingTournaments.length} existing tournament(s) with the same name. Deleting...`);
      
      for (const existingTournament of existingTournaments) {
        const tournamentId = existingTournament.id;
        
        // Delete related data in order (due to foreign key constraints)
        // 1. Fetch matches first
        const { data: matches } = await supabase
          .from('matches')
          .select('id')
          .eq('tournament_id', tournamentId);
        
        if (matches && matches.length > 0) {
          const matchIds = matches.map(m => m.id);
          
          // 1a. Delete scores (references matches)
          const { error: scoresError } = await supabase.from('scores').delete().in('match_id', matchIds);
          if (scoresError) {
            throw new Error(`Failed to delete scores: ${scoresError.message}`);
          }
          
          // 1b. Delete rating_history (references matches)
          const { error: ratingHistoryError } = await supabase.from('rating_history').delete().in('match_id', matchIds);
          if (ratingHistoryError) {
            throw new Error(`Failed to delete rating_history: ${ratingHistoryError.message}`);
          }
        }
        
        // 2. Delete pairings and pairing_teams (pairings reference matches)
        const { data: pairings } = await supabase
          .from('pairings')
          .select('id')
          .eq('tournament_id', tournamentId);
        
        if (pairings && pairings.length > 0) {
          const pairingIds = pairings.map(p => p.id);
          const { error: pairingTeamsError } = await supabase.from('pairing_teams').delete().in('pairing_id', pairingIds);
          if (pairingTeamsError) {
            throw new Error(`Failed to delete pairing_teams: ${pairingTeamsError.message}`);
          }
          
          const { error: pairingsError } = await supabase.from('pairings').delete().in('id', pairingIds);
          if (pairingsError) {
            throw new Error(`Failed to delete pairings: ${pairingsError.message}`);
          }
        }
        
        // 3. Delete matches (now safe since all references are removed)
        if (matches && matches.length > 0) {
          const { error: matchesError } = await supabase.from('matches').delete().eq('tournament_id', tournamentId);
          if (matchesError) {
            throw new Error(`Failed to delete matches: ${matchesError.message}`);
          }
        }
        
        // 4. Get teams associated with this tournament through tournament_invites (BEFORE deleting invites)
        const { data: invites } = await supabase
          .from('tournament_invites')
          .select('team_id')
          .eq('tournament_id', tournamentId)
          .not('team_id', 'is', null);
        
        const teamIds = invites?.map(inv => inv.team_id).filter((id, index, self) => self.indexOf(id) === index) || [];
        
        // 5. Delete tournament invites (must be before teams due to foreign key)
        await supabase.from('tournament_invites').delete().eq('tournament_id', tournamentId);
        
        // 6. Delete team_members for teams associated with this tournament
        if (teamIds.length > 0) {
          await supabase.from('team_members').delete().in('team_id', teamIds);
          // Delete teams
          await supabase.from('teams').delete().in('team_id', teamIds);
        }
        
        // 7. Delete registrations
        await supabase.from('registrations').delete().eq('tournament_id', tournamentId);
        
        // 8. Delete tournament referees
        await supabase.from('tournaments_referee').delete().eq('tournament_id', tournamentId);
        
        // 9. Delete the tournament
        const { error: deleteError } = await supabase
          .from('tournaments')
          .delete()
          .eq('id', tournamentId);
        
        if (deleteError) {
          throw new Error(`Failed to delete existing tournament: ${deleteError.message}`);
        }
        
        console.log(`  ✅ Deleted tournament (ID: ${tournamentId}) and related data`);
      }
      console.log('✅ Cleanup complete\n');
    } else {
      console.log('✅ No existing tournament found\n');
    }

    // Step 6: Create tournament
    console.log('🏆 Creating tournament...');
    const startTime = new Date();
    startTime.setHours(startTime.getHours() + 1); // 1 hour from now
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + 4); // 4 hours duration

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .insert({
        host_id: hostPlayer.id,
        game_id: GAME_ID,
        name: tournamentName,
        description: 'Automated group stage mixed doubles tournament with 6 teams (12 players)',
        venue_id: venue.id,
        match_format_id: matchFormat.id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        capacity: PLAYER_COUNT, // PLAYER_COUNT players (teams)
        registration_fee: 0,
        image_url: null,
        metadata: {
          format: 'group_knockout',
        },
      })
      .select()
      .single();

    if (tournamentError || !tournament) {
      throw new Error(`Failed to create tournament: ${tournamentError?.message || 'Unknown error'}`);
    }

    console.log(`✅ Created tournament: ${tournament.name} (ID: ${tournament.id})\n`);

    // Step 7: Add referees (host and second player)
    console.log('⚖️  Adding referees...');
    const { error: refereeError } = await supabase
      .from('tournaments_referee')
      .insert([
        {
          tournament_id: tournament.id,
          player_id: hostPlayer.id,
        },
        {
          tournament_id: tournament.id,
          player_id: refereePlayer.id,
        },
      ]);

    if (refereeError) {
      throw new Error(`Failed to add referees: ${refereeError.message}`);
    }

    console.log(`✅ Added referees: Host (Player ID: ${hostPlayer.id}) and Referee (Player ID: ${refereePlayer.id})\n`);

    // Step 8: Create teams (6 teams from 12 players, excluding host and referee)
    console.log('👥 Creating teams...');
    const teams: Team[] = [];
    const teamRegistrations: Registration[] = [];

    for (let i = 0; i < playingPlayers.length; i += 2) {
      const player1 = playingPlayers[i];
      const player2 = playingPlayers[i + 1];

      if (!player2) {
        console.log(`⚠️  Skipping player ${player1.id} - no partner available`);
        continue;
      }

      // Create team
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({})
        .select()
        .single();

      if (teamError || !team) {
        throw new Error(`Failed to create team: ${teamError?.message || 'Unknown error'}`);
      }

      teams.push(team);

      // Add team members
      const { error: membersError } = await supabase
        .from('team_members')
        .insert([
          {
            team_id: team.team_id,
            player_id: player1.id,
            created_at: new Date().toISOString(),
          },
          {
            team_id: team.team_id,
            player_id: player2.id,
            created_at: new Date().toISOString(),
          },
        ]);

      if (membersError) {
        throw new Error(`Failed to add team members: ${membersError.message}`);
      }

      console.log(
        `  ✅ Team ${teams.length}: ${player1.username || `Player ${player1.id}`} & ${player2.username || `Player ${player2.id}`} (Team ID: ${team.team_id})`
      );

      // Create tournament invite for doubles (player1 invites player2)
      const { data: invite, error: inviteError } = await supabase
        .from('tournament_invites')
        .insert({
          tournament_id: tournament.id,
          inviter_id: player1.id,
          invitee_id: player2.id,
          team_id: team.team_id,
          status: 'accepted', // Auto-accepted since we're registering them
          token: null,
          expires_at: null,
        })
        .select()
        .single();

      if (inviteError || !invite) {
        throw new Error(`Failed to create tournament invite: ${inviteError?.message || 'Unknown error'}`);
      }

      // Register both players for the tournament
      const { data: registration1, error: reg1Error } = await supabase
        .from('registrations')
        .insert({
          tournament_id: tournament.id,
          player_id: player1.id,
          txn_id: null,
        })
        .select()
        .single();

      if (reg1Error || !registration1) {
        throw new Error(`Failed to register player ${player1.id}: ${reg1Error?.message || 'Unknown error'}`);
      }

      const { data: registration2, error: reg2Error } = await supabase
        .from('registrations')
        .insert({
          tournament_id: tournament.id,
          player_id: player2.id,
          txn_id: null,
        })
        .select()
        .single();

      if (reg2Error || !registration2) {
        throw new Error(`Failed to register player ${player2.id}: ${reg2Error?.message || 'Unknown error'}`);
      }

      teamRegistrations.push(registration1, registration2);
    }

    console.log(`\n✅ Created ${teams.length} teams and registered all players\n`);

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 TOURNAMENT CREATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Tournament ID: ${tournament.id}`);
    console.log(`Tournament Name: ${tournament.name}`);
    console.log(`Host: ${hostPlayer.username || `Player ${hostPlayer.id}`} (ID: ${hostPlayer.id}) - Also Referee`);
    console.log(`Referee: ${refereePlayer.username || `Player ${refereePlayer.id}`} (ID: ${refereePlayer.id})`);
    console.log(`Venue: ${venue.name} (ID: ${venue.id})`);
    console.log(`Teams Created: ${teams.length}`);
    console.log(`Total Registrations: ${teamRegistrations.length}`);
    console.log(`Start Time: ${startTime.toLocaleString()}`);
    console.log(`End Time: ${endTime.toLocaleString()}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('🎉 Tournament created successfully!');

    return {
      tournament,
      hostPlayer,
      refereePlayer,
      teams,
      registrations: teamRegistrations,
    };
  } catch (error) {
    console.error('❌ Error creating tournament:', error);
    throw error;
  }
}

// Run the script
createGroupMensDoublesTournament()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
