import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { websocket } from "hono/bun";
import { showRoutes } from "hono/dev";
import errorHandler from "@/middleware/error";
import websocketRoutes from "@/routes/websocket.routes";
import { tournamentsRoutes } from "@/routes/tournaments.routes";
import { userRoutes } from "@/routes/user.routes";
import { playersRoutes } from "@/routes/players.routes";
import { venuesRoutes } from "@/routes/venues.routes";
import { matchFormatsRoutes } from "@/routes/matchFormats.routes";
import { registrationsRoutes } from "@/routes/registrations.routes";
import { teamsRoutes } from "@/routes/teams.routes";
import { ratingsRoutes } from "@/routes/ratings.routes";
import { matchesRoutes } from "@/routes/matches.routes";
import { scoresRoutes } from "@/routes/scores.routes";
import { courtsRoutes } from "@/routes/courts.routes";
import { pairingsRoutes } from "@/routes/pairings.routes";
import { friendsRoutes } from "@/routes/friends.routes";
import { notificationsRoutes } from "@/routes/notifications.routes";
import { gamesRoutes } from "@/routes/games.routes";
import { env } from "./config/env";
import matchRoutes from "@/lib/scoring";

const app = new Hono()
  .basePath("/api")
  // Middlewares
  .use("*", logger())
  .use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: false,
    })
  )
  .use("*", prettyJSON())
  .use("*", secureHeaders())
  .use("*", timing())
  //Routes
  .route("/ws", websocketRoutes)
  .route("/tournaments", tournamentsRoutes)
  .route("/user", userRoutes)
  .route("/players", playersRoutes)
  .route("/venues", venuesRoutes)
  .route("/match-formats", matchFormatsRoutes)
  .route("/registrations", registrationsRoutes)
  .route("/teams", teamsRoutes)
  .route("/ratings", ratingsRoutes)
  .route("/matches", matchesRoutes)
  .route("/scores", scoresRoutes)
  .route("/courts", courtsRoutes)
  .route("/pairings", pairingsRoutes)
  .route("/friends", friendsRoutes)
  .route("/notifications", notificationsRoutes)
  .route("/games", gamesRoutes)
  .route("/match", matchRoutes)
  .onError(errorHandler);

showRoutes(app, {
  verbose: true,
});

export default {
  port: env.PORT,
  fetch: app.fetch,
  websocket,
};