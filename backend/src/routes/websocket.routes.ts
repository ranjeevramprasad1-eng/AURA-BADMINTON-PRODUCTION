import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import {
  getMatchScore,
  getMatchConnections,
  addConnection,
  removeConnection,
  addTournamentConnection,
  removeTournamentConnection,
} from "@/lib/websocket";

const websocketRoutes = new Hono();

websocketRoutes.get(
  "/dummy",
  upgradeWebSocket((c) => {
    return {
      onOpen(event: any, ws: any) {
        console.log("🔌 Dummy WebSocket opened");
      },
      onClose(event: any, ws: any) {
        console.log("🔌 Dummy WebSocket closed");
      },
      onError(error: any, ws: any) {
        console.error("❌ Dummy WebSocket error:", error);
      },
      onMessage(event: any, ws: any) {
        console.log("🔌 Dummy WebSocket message:", event.data);
      },
    };
  })
);

// WebSocket route for tournament updates (pairings, standings, etc.)
websocketRoutes.get(
  "/tournament/:id/updates",
  upgradeWebSocket((c) => {
    const tournamentId = parseInt(c.req.param("id"));

    if (isNaN(tournamentId)) {
      return {
        onError(error: any, ws: any) {
          ws.send(JSON.stringify({ error: "Invalid tournament ID" }));
          ws.close();
        },
      };
    }

    return {
      onOpen(event: any, ws: any) {
        console.log(`🔌 Tournament ${tournamentId} WebSocket opened`);
        addTournamentConnection(tournamentId, ws);

        // Send connection confirmation
        ws.send(JSON.stringify({
          type: "connected",
          tournamentId,
          message: "Connected to tournament updates"
        }));
      },

      onClose(event: any, ws: any) {
        console.log(`🔌 Tournament ${tournamentId} WebSocket closed`);
        removeTournamentConnection(tournamentId, ws);
      },

      onError(error: any, ws: any) {
        console.error(`❌ Tournament ${tournamentId} WebSocket error:`, error);
        removeTournamentConnection(tournamentId, ws);
      },

      onMessage(event: any, ws: any) {
        // Tournament WS is primarily for server-to-client broadcasts
        // But we can handle ping/pong for keepalive
        try {
          const data = JSON.parse(event.data);
          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch (error) {
          // Ignore parse errors
        }
      },
    };
  })
);

// WebSocket route for match score updates
websocketRoutes.get(
  "/match/:matchId/score",
  upgradeWebSocket((c) => {
    const matchId = parseInt(c.req.param("matchId"));

    if (isNaN(matchId)) {
      return {
        onError(error: any, ws: any) {
          ws.send(JSON.stringify({ error: "Invalid match ID" }));
          ws.close();
        },
      };
    }

    const connections = getMatchConnections(matchId);
    const currentScore = getMatchScore(matchId);

    return {
      onOpen(event: any, ws: any) {
        console.log(`🔌 WebSocket opened for match ${matchId}`);
        addConnection(matchId, ws);

        // Send current score to newly connected client
        ws.send(JSON.stringify({
          type: "score_update",
          matchId,
          teamA: currentScore.teamA,
          teamB: currentScore.teamB,
        }));
      },

      onClose(event: any, ws: any) {
        console.log(`🔌 WebSocket closed for match ${matchId}`);
        removeConnection(matchId, ws);
      },

      onError(error: any, ws: any) {
        console.error(`❌ WebSocket error for match ${matchId}:`, error);
        removeConnection(matchId, ws);
      },

      onMessage(event: any, ws: any) {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "init") {
            // Client sends initial score data
            const { teamA, teamB } = data;

            // Only initialize if score is still at default (0-0) - this means no one has set it yet
            // This allows the first client to initialize, but won't overwrite if score was already set
            if (currentScore.teamA === 0 && currentScore.teamB === 0 && (teamA > 0 || teamB > 0)) {
              currentScore.teamA = teamA || 0;
              currentScore.teamB = teamB || 0;
              console.log(`📊 Initialized match ${matchId} score from client: ${currentScore.teamA} - ${currentScore.teamB}`);

              // Broadcast to all clients
              const updateMessage = JSON.stringify({
                type: "score_update",
                matchId,
                teamA: currentScore.teamA,
                teamB: currentScore.teamB,
              });

              connections.forEach((client) => {
                if (client.readyState === 1) { // WebSocket.OPEN
                  client.send(updateMessage);
                }
              });
            } else {
              // Score already initialized, just send current score back to this client
              ws.send(JSON.stringify({
                type: "score_update",
                matchId,
                teamA: currentScore.teamA,
                teamB: currentScore.teamB,
              }));
            }
          } else if (data.type === "increment") {
            const { team } = data;

            if (team === "A") {
              currentScore.teamA++;
            } else if (team === "B") {
              currentScore.teamB++;
            } else {
              ws.send(JSON.stringify({ error: "Invalid team. Use 'A' or 'B'" }));
              return;
            }

            // Broadcast updated score to all connected clients
            const updateMessage = JSON.stringify({
              type: "score_update",
              matchId,
              teamA: currentScore.teamA,
              teamB: currentScore.teamB,
            });

            connections.forEach((client) => {
              if (client.readyState === 1) { // WebSocket.OPEN
                client.send(updateMessage);
              }
            });

            console.log(`📊 Match ${matchId} score updated: ${currentScore.teamA} - ${currentScore.teamB}`);
          } else {
            ws.send(JSON.stringify({ error: "Unknown message type" }));
          }
        } catch (error) {
          console.error(`❌ Error processing message for match ${matchId}:`, error);
          ws.send(JSON.stringify({ error: "Invalid message format" }));
        }
      },
    };
  })
);

export default websocketRoutes;
