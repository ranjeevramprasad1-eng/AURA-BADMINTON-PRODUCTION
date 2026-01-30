import { z } from "zod";

// Tournament query parameters validation
export const tournamentQuerySchema = z.object({
  max_age: z.string().regex(/^\d+$/).transform(Number).optional(),
  eligible_gender: z.enum(["M", "W", "MW", "male", "female"]).optional(),
  game_id: z.string().regex(/^\d+$/).transform(Number).optional(),
  status: z.enum(["upcoming", "live", "completed"]).optional(),
  mini: z.enum(["true", "false"]).optional(),
});

// Tournament ID parameter validation
export const tournamentIdSchema = z.object({
  id: z.string().min(1, "Tournament ID is required"),
});

// Tournament round parameter validation
export const tournamentRoundSchema = z.object({
  id: z.string().min(1, "Tournament ID is required"),
  round: z.string().min(1, "Round is required"),
});

// Tournament match parameter validation
export const tournamentMatchSchema = z.object({
  id: z.string().min(1, "Tournament ID is required"),
  round: z.string().min(1, "Round is required"),
  match: z.string().min(1, "Match ID is required"),
});

// Referee match update body validation
export const refereeMatchUpdateSchema = z.object({
  newScore: z.string().min(1, "newScore is required"),
  stepback: z.boolean().optional().default(false),
  positions: z
    .object({
      pos1: z.string().min(1, "pos1 is required"),
      pos2: z.string().min(1, "pos2 is required"),
      pos3: z.string().min(1, "pos3 is required"),
      pos4: z.string().min(1, "pos4 is required"),
    })
    .optional(),
});

// Player schemas
export const playerIdSchema = z.object({
  id: z.string().min(1, "Player ID is required"),
});

export const createPlayerSchema = z.object({
  username: z.string().min(1, "Username is required"),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  gender: z.enum(["M", "W", "male", "female"]).optional(),
  photo_url: z.string().url().optional().or(z.literal("")),
});

export const updatePlayerSchema = createPlayerSchema.partial();

// Venue schemas
export const venueIdSchema = z.object({
  id: z.string().min(1, "Venue ID is required"),
});

export const createVenueSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().min(1, "Address is required"),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const updateVenueSchema = createVenueSchema.partial();

// Match Format schemas
export const matchFormatIdSchema = z.object({
  id: z.string().min(1, "Match Format ID is required"),
});

export const createMatchFormatSchema = z.object({
  type: z.enum(["mens_doubles", "womens_doubles", "mixed_doubles", "singles"]),
  min_age: z.number().int().positive().optional(),
  max_age: z.number().int().positive().optional(),
  eligible_gender: z.enum(["M", "W", "MW"]),
  total_rounds: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const updateMatchFormatSchema = createMatchFormatSchema.partial();

// Registration schemas
export const registrationIdSchema = z.object({
  id: z.string().min(1, "Registration ID is required"),
});

export const createRegistrationSchema = z.object({
  tournament_id: z.number().int().positive(),
  team_id: z.number().int().positive().optional(),
  txn_id: z.string().uuid().optional(),
});

// Tournament referee schemas
export const addTournamentRefereeSchema = z.object({
  player_id: z.number().int().positive(),
});

export const removeTournamentRefereeSchema = z.object({
  id: z.string().min(1, "Tournament ID is required"),
  player_id: z.string().min(1, "Player ID is required"),
});

// Team schemas
export const teamIdSchema = z.object({
  id: z.string().min(1, "Team ID is required"),
});

export const createTeamSchema = z.object({
  player_ids: z.array(z.number().int().positive()).min(1, "At least one player is required"),
});

export const addTeamMemberSchema = z.object({
  player_id: z.number().int().positive(),
});

export const removeTeamMemberSchema = z.object({
  player_id: z.number().int().positive(),
});

export const removeTeamMemberParamSchema = z.object({
  id: z.string().min(1, "Team ID is required"),
  playerId: z.string().min(1, "Player ID is required"),
});

// Rating schemas
export const getRatingSchema = z.object({
  player_id: z.string().min(1, "Player ID is required"),
});

// Match schemas
export const matchIdSchema = z.object({
  id: z.string().min(1, "Match ID is required"),
});

export const createMatchSchema = z.object({
  tournament_id: z.number().int().positive(),
  referee_id: z.number().int().positive().optional(),
  court_id: z.number().int().positive().optional(),
  round: z.string().min(1, "Round is required"),
  status: z.enum(["scheduled", "in_progress", "completed"]).default("scheduled"),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
});

export const updateMatchSchema = z.object({
  referee_id: z.number().int().positive().optional(),
  court_id: z.number().int().positive().optional(),
  winner_team_id: z.number().int().positive().optional(),
  status: z.enum(["scheduled", "in_progress", "completed"]).optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
});

// Score schemas
export const scoreIdSchema = z.object({
  id: z.string().min(1, "Score ID is required"),
});

export const createScoreSchema = z.object({
  match_id: z.number().int().positive(),
  team_a_score: z.number().int().nonnegative().default(0),
  team_b_score: z.number().int().nonnegative().default(0),
  serving_team_id: z.number().int().positive().optional(),
  server_sequence: z.enum(["1", "2"]).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const updateScoreSchema = createScoreSchema.partial().extend({
  match_id: z.number().int().positive().optional(),
});

// Start match schema
export const startMatchSchema = z.object({
  serving_team_id: z.number().int().positive(),
  positions: z.object({
    pos_1: z.number().int().positive(),
    pos_2: z.number().int().positive(),
    pos_3: z.number().int().positive(),
    pos_4: z.number().int().positive(),
  }),
});

// Record point schema
export const recordPointSchema = z.object({
  rally_winner_team_id: z.number().int().positive(),
});

// Pairing schemas
export const pairingIdSchema = z.object({
  id: z.string().min(1, "Pairing ID is required"),
});

export const createPairingSchema = z.object({
  tournament_id: z.number().int().positive(),
  match_id: z.number().int().positive(),
  team_ids: z.array(z.number().int().positive()).length(2, "Exactly 2 teams required"),
});

// Pairing generation schemas
export const generateRoundSchema = z.object({
  tournamentId: z.number().int().positive(),
});

// Court schemas
export const courtIdSchema = z.object({
  id: z.string().min(1, "Court ID is required"),
});

export const createCourtSchema = z.object({
  venue_id: z.number().int().positive(),
  court_number: z.number().int().positive(),
});

export const updateCourtSchema = createCourtSchema.partial();

// Tournament creation schema - match format without type (auto-generated)
export const createTournamentMatchFormatSchema = z.object({
  min_age: z.number().int().positive().optional(),
  max_age: z.number().int().positive().optional(),
  eligible_gender: z.enum(["M", "W", "MW"]),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Tournament creation schema
export const createTournamentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  venue_id: z.number().int().positive(),
  game_id: z.number().int().positive(),
  match_format: createTournamentMatchFormatSchema, // Match format without type (auto-generated)
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  capacity: z.number().int().positive(),
  registration_fee: z.number().nonnegative().default(0),
  image_url: z.string().url().optional().or(z.literal("")),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Friends schemas
export const friendIdSchema = z.object({
  id: z.string().min(1, "Friend ID is required"),
});

export const createFriendRequestSchema = z.object({
  friend_id: z.number().int().positive(),
});

export const updateFriendRequestSchema = z.object({
  status: z.enum(["accepted", "rejected", "blocked"]),
});

// Tournament invite schemas
export const tournamentInviteIdSchema = z.object({
  id: z.string().min(1, "Invite ID is required"),
});

export const tournamentInviteTokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const createTournamentInviteSchema = z.object({
  invitee_id: z.number().int().positive().optional(),
  team_id: z.number().int().positive().nullish(), // optional; backend creates team when missing
});

export const updateTournamentInviteSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

// Notification schemas
export const notificationIdSchema = z.object({
  id: z.string().min(1, "Notification ID is required"),
});

// ============================================================================
// TOURNAMENT ENGINE SCHEMAS (Group + Knockout Format)
// ============================================================================

// Initialize groups schema
export const initializeGroupsSchema = z.object({
  numberOfGroups: z.enum(["2", "4", "8"]).transform(val => parseInt(val) as 2 | 4 | 8),
});

// Swap team between groups schema
export const swapTeamGroupSchema = z.object({
  teamId: z.number().int().positive(),
  fromGroup: z.string().min(1, "From group is required").max(1),
  toGroup: z.string().min(1, "To group is required").max(1),
});

// Set match winner schema
export const setMatchWinnerSchema = z.object({
  winnerTeamId: z.number().int().positive(),
});

// Match ID param for engine
export const engineMatchIdSchema = z.object({
  matchId: z.string().min(1, "Match ID is required"),
});

// Engine match filter query
export const engineMatchFilterSchema = z.object({
  round: z.string().optional(),
  status: z.enum(["scheduled", "completed"]).optional(),
});

