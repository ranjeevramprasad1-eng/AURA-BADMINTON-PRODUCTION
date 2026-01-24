
// Mock Logic
interface TeamPositions {
    right_player_id: number;
    left_player_id: number;
}

let scoreA = 0;
let scoreB = 0;
let servingTeamId = 'A';

// Initial: A1(Right-Pos2-Even), A2(Left-Pos1-Odd)
// Note: In new logic, Right = Pos2, Left = Pos1.
let team_a_pos = { right_player_id: 1, left_player_id: 2 };
let team_b_pos = { right_player_id: 3, left_player_id: 4 };

// A1 serves (Even 0).
let servingPlayerId = 1;

console.log(`START: 0-0. Server: ${servingPlayerId} (A)`);
console.log(`A Pos: R=${team_a_pos.right_player_id}, L=${team_a_pos.left_player_id}`);

// 1. A serves, A wins. (1-0).
scoreA++;
// Swap A.
let temp = team_a_pos.right_player_id; team_a_pos.right_player_id = team_a_pos.left_player_id; team_a_pos.left_player_id = temp;
// Server stays same.
console.log(`\n1. A Wins (1-0). Swap.`);
console.log(`A Pos: R=${team_a_pos.right_player_id}, L=${team_a_pos.left_player_id}`);
// A1 was Right(1). Now Left(1).
// Score 1 (Odd). Server is A1.
// Check consistency: Odd -> Left. Left is 1. Consistent.

// 2. A serves, B wins. (Side Out). (1-1).
scoreB++;
servingTeamId = 'B';
// Side Out Logic for B.
// Score B=1 (Odd).
// Odd -> Left.
// B Pos: R=3, L=4.
servingPlayerId = (scoreB % 2 === 0) ? team_b_pos.right_player_id : team_b_pos.left_player_id;
// 1 Odd -> Left -> 4.
console.log(`\n2. B Wins (Side Out) (1-1). Server: ${servingPlayerId} (B)`);
// Expected: 4.

// 3. B serves, B wins. (1-2).
scoreB++;
// Swap B.
temp = team_b_pos.right_player_id; team_b_pos.right_player_id = team_b_pos.left_player_id; team_b_pos.left_player_id = temp;
// Server stays 4.
console.log(`\n3. B Wins (1-2). Swap.`);
console.log(`B Pos: R=${team_b_pos.right_player_id}, L=${team_b_pos.left_player_id}`);
// B4 was Left(4). Now Right(4).
// Score 2 (Even). Server is B4.
// Check: Even -> Right. Right is 4. Consistent.

// 4. B serves, A wins. (Side Out BACK TO A). (2-2).
scoreA++;
servingTeamId = 'A';
// Side Out Logic for A.
// Score A=2 (Even).
// Even -> Right.
servingPlayerId = (scoreA % 2 === 0) ? team_a_pos.right_player_id : team_a_pos.left_player_id;

console.log(`\n4. A Wins (Side Out Back) (2-2). Server: ${servingPlayerId} (A)`);
console.log(`A Pos: R=${team_a_pos.right_player_id}, L=${team_a_pos.left_player_id}`);

// Analysis:
// A Pos at step 1: R=2, L=1.
// A did not swap in Step 2 or 3.
// So A Pos is still R=2, L=1.
// Score A=2 (Even).
// Logic selects Right.
// Right is 2.
// Serving Player = 2.
// Player 2 is at Pos2 (Bottom).
// Is this correct?
// Original: A1(R), A2(L).
// 1-0 Swap: A2(R), A1(L).
// Server was A1(L).
// Side Out.
// A Recovers at 2-2.
// Server should be the one in Right Court.
// Right Court has A2.
// So Server = A2.
// Logic Selected 2.
// Seems CORRECT.

