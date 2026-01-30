import { Hono } from "hono";
import { authMiddleware, type AuthContext } from "@/middleware/auth";
import { zValidator } from "@/middleware/zodValidator";
import {
  matchIdSchema,
  createMatchSchema,
  updateMatchSchema,
  tournamentIdSchema,
  startMatchSchema,
  recordPointSchema,
} from "@/utils/validation";
import {
  getAllMatches,
  getMatchById,
  getTournamentMatches,
  createMatch,
  updateMatch,
  deleteMatch,
  startMatch,
  recordPoint,
  undoLastPoint,
  getMatchState,
  getRefereeMatches,
} from "@/controllers/matches.controller";

export const matchesRoutes = new Hono<AuthContext>();

// GET /matches - Get all matches
matchesRoutes.get("/", authMiddleware, getAllMatches);

// GET /matches/referee - Get matches assigned to current user as referee
matchesRoutes.get("/referee", authMiddleware, getRefereeMatches);

// GET /matches/:id - Get match by ID
matchesRoutes.get(
  "/:id",
  authMiddleware,
  zValidator("param", matchIdSchema),
  getMatchById
);

// GET /tournaments/:id/matches - Get all matches for a tournament
matchesRoutes.get(
  "/tournaments/:id/matches",
  authMiddleware,
  zValidator("param", tournamentIdSchema),
  getTournamentMatches
);

// POST /matches - Create a new match
matchesRoutes.post(
  "/",
  authMiddleware,
  zValidator("json", createMatchSchema),
  createMatch
);

// PUT /matches/:id - Update match
matchesRoutes.put(
  "/:id",
  authMiddleware,
  zValidator("param", matchIdSchema),
  zValidator("json", updateMatchSchema),
  updateMatch
);

// DELETE /matches/:id - Delete match
matchesRoutes.delete(
  "/:id",
  authMiddleware,
  zValidator("param", matchIdSchema),
  deleteMatch
);

// POST /matches/:id/start - Start a match with positions
matchesRoutes.post(
  "/:id/start",
  authMiddleware,
  zValidator("param", matchIdSchema),
  zValidator("json", startMatchSchema),
  startMatch
);

// POST /matches/:id/point - Record a point
matchesRoutes.post(
  "/:id/point",
  authMiddleware,
  zValidator("param", matchIdSchema),
  zValidator("json", recordPointSchema),
  recordPoint
);

// POST /matches/:id/undo - Undo last point
matchesRoutes.post(
  "/:id/undo",
  authMiddleware,
  zValidator("param", matchIdSchema),
  undoLastPoint
);

// GET /matches/:id/state - Get current match state
matchesRoutes.get(
  "/:id/state",
  authMiddleware,
  zValidator("param", matchIdSchema),
  getMatchState
);

