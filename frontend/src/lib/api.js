import { apiClient } from '@/config';

// Tournaments API
export const tournamentsApi = {
  // GET /tournaments - Get all tournaments with filtering
  getAll: (params = {}) => {
    return apiClient.get('/tournaments', { params });
  },

  // GET /tournaments/:id - Get individual tournament details
  getById: (id, mini = false) => {
    const params = mini ? { mini: 'true' } : {};
    return apiClient.get(`/tournaments/${id}`, { params });
  },

  // GET /tournaments/:id/rounds - Get tournament rounds from metadata
  getRounds: (id) => {
    return apiClient.get(`/tournaments/${id}/rounds`);
  },

  // GET /tournaments/:id/:round - Get tournament round details
  getRound: (id, round) => {
    return apiClient.get(`/tournaments/${id}/${round}`);
  },

  // POST /tournaments/:id/join - Join as referee
  joinAsReferee: (id) => {
    return apiClient.post(`/tournaments/${id}/join`);
  },

  // GET /tournaments/:id/:round/:match - Get match details
  getMatch: (id, round, match) => {
    return apiClient.get(`/tournaments/${id}/${round}/${match}`);
  },

  // GET /tournaments/referee/:id/:round/:match - Get referee match details
  getRefereeMatch: (id, round, match) => {
    return apiClient.get(`/tournaments/referee/${id}/${round}/${match}`);
  },

  // POST /tournaments/referee/:id/:round/:match - Update referee match score
  updateRefereeMatch: (id, round, match, data) => {
    return apiClient.post(`/tournaments/referee/${id}/${round}/${match}`, data);
  },

  // POST /tournaments - Create a new tournament
  create: (data) => {
    return apiClient.post('/tournaments', data);
  },

  // POST /tournaments/:id/register - Register for a tournament
  register: (id, teamId = null) => {
    return apiClient.post(`/tournaments/${id}/register`, teamId ? { team_id: teamId } : {});
  },

  // POST /tournaments/:id/invite - Invite friend to tournament team
  invite: (id, data) => {
    return apiClient.post(`/tournaments/${id}/invite`, data);
  },

  // POST /tournaments/:id/invite/link - Generate shareable invite link
  generateInviteLink: (id, data = {}) => {
    return apiClient.post(`/tournaments/${id}/invite/link`, data);
  },

  // GET /tournaments/invites/:token - Get invite details by token
  getInviteByToken: (token) => {
    return apiClient.get(`/tournaments/invites/${token}`);
  },

  // POST /tournaments/invites/:token/accept - Accept invite via token
  acceptInviteByToken: (token) => {
    return apiClient.post(`/tournaments/invites/${token}/accept`);
  },

  // PUT /tournaments/invites/:id - Accept/reject invite
  updateInvite: (id, data) => {
    return apiClient.put(`/tournaments/invites/${id}`, data);
  },

  // GET /tournaments/:id/invites - Get all invites for a tournament
  getInvites: (id) => {
    return apiClient.get(`/tournaments/${id}/invites`);
  },

  // GET /tournaments/hosted - Get tournaments hosted by current player
  getHosted: () => {
    return apiClient.get("/tournaments/hosted");
  },

  // GET /tournaments/referee - Get tournaments where current player is a referee
  getReferee: () => {
    return apiClient.get("/tournaments/referee");
  },

  // GET /tournaments/registered - Get tournaments where current player is registered
  getRegistered: () => {
    return apiClient.get("/tournaments/registered");
  },

  // POST /tournaments/:id/referees - Add a referee to a tournament
  addReferee: (id, playerId) => {
    return apiClient.post(`/tournaments/${id}/referees`, {
      player_id: playerId,
    });
  },

  // DELETE /tournaments/:id/referees/:playerId - Remove a referee from a tournament
  removeReferee: (id, playerId) => {
    return apiClient.delete(`/tournaments/${id}/referees/${playerId}`);
  },

  // GET /tournaments/:id/round-status - Get current round status
  getRoundStatus: (id) => {
    return apiClient.get(`/tournaments/${id}/round-status`);
  },

  // GET /tournaments/:id/current-round-matches - Get matches for current round
  getCurrentRoundMatches: (id) => {
    return apiClient.get(`/tournaments/${id}/current-round-matches`);
  },

  // DELETE /tournaments/:id - Delete tournament and all related data
  delete: (id) => {
    return apiClient.delete(`/tournaments/${id}`);
  },
};

// Matches API
export const matchesApi = {
  // PUT /matches/:id - Update match
  update: (id, data) => {
    return apiClient.put(`/matches/${id}`, data);
  },

  // POST /matches/:id/start - Start a match with positions
  start: (id, data) => {
    // Redirect to new scoring engine (scoring.ts)
    return apiClient.post(`/match/start`, { ...data, match_id: parseInt(id) });
  },

  // GET /matches/:id/state - Get current match state
  getState: (id) => {
    // Redirect to new scoring engine (scoring.ts)
    return apiClient.get(`/match/${id}`);
  },

  // POST /matches/:id/point - Record a point
  recordPoint: (id, data) => {
    // Redirect to new scoring engine (scoring.ts)
    return apiClient.post(`/match/point`, { ...data, match_id: parseInt(id) });
  },

  // POST /matches/:id/undo - Undo last point
  undo: (id) => {
    // Redirect to new scoring engine (scoring.ts)
    return apiClient.post(`/match/undo`, { match_id: parseInt(id) });
  },

  // GET /matches/referee - Get matches assigned to current user as referee
  getRefereeMatches: () => {
    return apiClient.get("/matches/referee");
  },
};
// Pairings API
export const pairingsApi = {
  // POST /pairings/generate-round - Generate pairings for the next round
  generateRound: (tournamentId) => {
    return apiClient.post("/pairings/generate-round", {
      tournamentId,
    });
  },
};

// Players API
export const playersApi = {
  // GET /players/search?q=query - Search players by username
  search: (query) => {
    return apiClient.get("/players/search", { params: { q: query } });
  },

  // GET /players/:id - Get player by ID
  getById: (id) => {
    return apiClient.get(`/players/${id}`);
  },
};

// User API
export const userApi = {
  // GET /user/details - Get comprehensive user details
  getDetails: () => {
    return apiClient.get('/user/details');
  },
};

// Venues API
export const venuesApi = {
  // GET /venues - Get all venues
  getAll: () => {
    return apiClient.get('/venues');
  },
};

// Games API
export const gamesApi = {
  // GET /games - Get all enabled games
  getAll: () => {
    return apiClient.get('/games');
  },
};

// Match Formats API
export const matchFormatsApi = {
  // GET /match-formats - Get all match formats
  getAll: () => {
    return apiClient.get('/match-formats');
  },
};

// Friends API
export const friendsApi = {
  // GET /friends - Get user's friends list
  getAll: () => {
    return apiClient.get('/friends');
  },

  // GET /friends/pending - Get pending friend requests
  getPending: () => {
    return apiClient.get('/friends/pending');
  },

  // POST /friends - Send friend request
  sendRequest: (friendId) => {
    return apiClient.post('/friends', { friend_id: friendId });
  },

  // PUT /friends/:id - Accept/reject friend request
  updateRequest: (id, status) => {
    return apiClient.put(`/friends/${id}`, { status });
  },

  // DELETE /friends/:id - Remove friend or cancel request
  remove: (id) => {
    return apiClient.delete(`/friends/${id}`);
  },
};

// Notifications API
export const notificationsApi = {
  // GET /notifications - Get all notifications for current user
  getAll: (params = {}) => {
    return apiClient.get('/notifications', { params });
  },

  // GET /notifications/unread-count - Get unread count
  getUnreadCount: () => {
    return apiClient.get('/notifications/unread-count');
  },

  // PUT /notifications/:id/read - Mark notification as read
  markAsRead: (id) => {
    return apiClient.put(`/notifications/${id}/read`);
  },

  // PUT /notifications/read-all - Mark all notifications as read
  markAllAsRead: () => {
    return apiClient.put('/notifications/read-all');
  },
};

// Tournament Engine API (Group + Knockout Format)
export const tournamentEngineApi = {
  // GET /tournaments/:id/engine/info - Get tournament engine info
  getInfo: (id) => {
    return apiClient.get(`/tournaments/${id}/engine/info`);
  },

  // GET /tournaments/:id/engine/standings - Get group standings
  getStandings: (id) => {
    return apiClient.get(`/tournaments/${id}/engine/standings`);
  },

  // GET /tournaments/:id/engine/teams - Get registered teams with group assignments
  getTeams: (id) => {
    return apiClient.get(`/tournaments/${id}/engine/teams`);
  },

  // GET /tournaments/:id/engine/matches - Get all matches
  getMatches: (id, filter = {}) => {
    return apiClient.get(`/tournaments/${id}/engine/matches`, { params: filter });
  },

  // GET /tournaments/:id/engine/next-action - Get next action needed
  getNextAction: (id) => {
    return apiClient.get(`/tournaments/${id}/engine/next-action`);
  },

  // POST /tournaments/:id/engine/initialize - Initialize groups
  initializeGroups: (id, numberOfGroups) => {
    return apiClient.post(`/tournaments/${id}/engine/initialize`, { numberOfGroups: String(numberOfGroups) });
  },

  // POST /tournaments/:id/engine/next-round - Start next round
  startNextRound: (id) => {
    return apiClient.post(`/tournaments/${id}/engine/next-round`);
  },

  // POST /tournaments/:id/engine/swap-team - Swap team between groups
  swapTeam: (id, teamId, fromGroup, toGroup) => {
    return apiClient.post(`/tournaments/${id}/engine/swap-team`, { teamId, fromGroup, toGroup });
  },

  // POST /tournaments/:id/engine/reset - Reset tournament
  reset: (id) => {
    return apiClient.post(`/tournaments/${id}/engine/reset`);
  },

  // POST /tournaments/:id/engine/set-all-winners - Set all pending matches with Team 1 as winner (testing)
  setAllWinners: (id) => {
    return apiClient.post(`/tournaments/${id}/engine/set-all-winners`);
  },

  // POST /tournaments/engine/match/:matchId/winner - Set match winner
  setMatchWinner: (matchId, winnerTeamId) => {
    return apiClient.post(`/tournaments/engine/match/${matchId}/winner`, { winnerTeamId });
  },
};

