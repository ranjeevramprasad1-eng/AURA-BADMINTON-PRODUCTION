
// Mock Context and State
const BADMINTON_MAX_POINT = 30;
const BADMINTON_POINTS_TO_WIN = 21;
const BADMINTON_WIN_BY = 2;

interface TeamPositions {
    right_player_id: number;
    left_player_id: number;
}

interface BadmintonMetadata {
    sets: { a: number, b: number };
    serving_player_id: number;
    team_a_pos: TeamPositions;
    team_b_pos: TeamPositions;
}

// Initial State
let scoreA = 8;
let scoreB = 8;
let servingTeam = 'A'; // A is serving
let servingPlayerId = 1; // Player 1 is serving (Team A)
let team_a_pos = { right_player_id: 1, left_player_id: 2 }; // 1 on right, 2 on left (Even score 8 -> Right court? No wait, 8 is even, so server should be on Right. Yes.)
let team_b_pos = { right_player_id: 3, left_player_id: 4 }; // 3 on right, 4 on left

console.log(`INITIAL STATE: ${scoreA}-${scoreB}, Server: ${servingPlayerId} (Team ${servingTeam})`);
console.log(`Positions A: [${team_a_pos.right_player_id}, ${team_a_pos.left_player_id}]`);

// SIMULATE POINT: Team A wins (Server wins)
const rally_winner_team_id = 'A';
const isTeamAWinRally = (rally_winner_team_id === 'A');
const isServerWinRally = (servingTeam === rally_winner_team_id);

console.log(`\nRally Winner: ${rally_winner_team_id}. isServerWinRally: ${isServerWinRally}`);

// 1. Award Point
if (isTeamAWinRally) scoreA++; else scoreB++;

// 2. Determine New Server and Positions
if (isServerWinRally) {
    // Server's team won rally -> Swap POSITIONS (Left <-> Right)
    console.log("Server won -> SWAPPING POSITIONS");
    if (isTeamAWinRally) {
        // SWAP A
        const temp = team_a_pos.right_player_id;
        team_a_pos.right_player_id = team_a_pos.left_player_id;
        team_a_pos.left_player_id = temp;
    } else {
        // SWAP B
        const temp = team_b_pos.right_player_id;
        team_b_pos.right_player_id = team_b_pos.left_player_id;
        team_b_pos.left_player_id = temp;
    }
} else {
    // Side out
    console.log("Side out -> New Server");
    servingTeam = rally_winner_team_id;
    if (isTeamAWinRally) {
        servingPlayerId = (scoreA % 2 === 0) ? team_a_pos.right_player_id : team_a_pos.left_player_id;
    } else {
        servingPlayerId = (scoreB % 2 === 0) ? team_b_pos.right_player_id : team_b_pos.left_player_id;
    }
}

console.log(`\nRESULT STATE: ${scoreA}-${scoreB}, Server: ${servingPlayerId}`);
console.log(`Positions A: [${team_a_pos.right_player_id}, ${team_a_pos.left_player_id}]`);

// Validation
// Old Score 8 (Even). Server A (1) was on Right.
// New Score 9 (Odd). Server A (1) should be on Left.
// Swap happened?
// Initial A: [1, 2].
// Swap -> A: [2, 1].
// Right: 2. Left: 1.
// Server is still 1. 1 is on Left. 9 is Odd. MATCHES.

console.log("----------------------------------------------------------------");

// SIMULATE ANOTHER POINT: Team A wins again (Server wins)
console.log(`\nNEXT RALLY. Server: ${servingPlayerId} (Team ${servingTeam})`);

const rally_winner_2 = 'A';
const isTeamAWinRally_2 = (rally_winner_2 === 'A');
const isServerWinRally_2 = (servingTeam === rally_winner_2);

// 1. Award Point
if (isTeamAWinRally_2) scoreA++; else scoreB++;

// 2. Positions
if (isServerWinRally_2) {
    console.log("Server won -> SWAPPING POSITIONS");
    if (isTeamAWinRally_2) {
        const temp = team_a_pos.right_player_id;
        team_a_pos.right_player_id = team_a_pos.left_player_id;
        team_a_pos.left_player_id = temp;
    } else {
        const temp = team_b_pos.right_player_id;
        team_b_pos.right_player_id = team_b_pos.left_player_id;
        team_b_pos.left_player_id = temp;
    }
}

console.log(`\nRESULT STATE: ${scoreA}-${scoreB}, Server: ${servingPlayerId}`);
console.log(`Positions A: [${team_a_pos.right_player_id}, ${team_a_pos.left_player_id}]`);

// Validation
// Old Score 9 (Odd). Server A (1) was on Left. A: [2, 1].
// New Score 10 (Even). Server A (1) should be on Right.
// Swap -> A: [1, 2].
// Right: 1. Left: 2.
// Server 1 is on Right. 10 is Even. MATCHES.
