import { supabase } from "./supabase"; // Ensure this path is correct for your project

// ==========================================
// TYPES
// ==========================================

export interface PlayerStats {
  id: number; // Changed to number to match SQL SERIAL
  mu: number;
  sigma: number;
}

interface RatingResult {
  teamA_new: PlayerStats[];
  teamB_new: PlayerStats[];
}

// Default starting stats
export const DEFAULT_MU = 25.0;
export const DEFAULT_SIGMA = 8.33;

// ==========================================
// INTERNAL MATH HELPERS
// ==========================================

function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function Phi(t: number): number {
  return 0.5 * (1 + erf(t / Math.sqrt(2)));
}

function generateNormal(): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function randomGamma(alpha: number, beta: number = 1): number {
  if (alpha < 1)
    return randomGamma(1 + alpha, beta) * Math.pow(Math.random(), 1 / alpha);
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v;
    do {
      x = generateNormal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return (d * v) / beta;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v)))
      return (d * v) / beta;
  }
}

function randomBeta(alpha: number, beta: number): number {
  const x = randomGamma(alpha, 1);
  const y = randomGamma(beta, 1);
  return x / (x + y);
}

function tanh(x: number): number {
  return Math.tanh(x);
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ==========================================
// PROBABILITY LOGIC
// ==========================================

const memo = new Map<string, number>();

function per_point_base_prob(
  muA: number,
  sigmaA: number,
  muB: number,
  sigmaB: number,
): number {
  const combined_std = Math.sqrt(Math.pow(sigmaA, 2) + Math.pow(sigmaB, 2));
  if (combined_std === 0) return 0.5;
  const z = (muA - muB) / (Math.sqrt(2) * combined_std);
  return Phi(z);
}

function points_component(
  scoreA: number,
  scoreB: number,
  target: number = 11,
): number {
  const s = scoreA - scoreB;
  const remA = Math.max(0, target - scoreA);
  const remB = Math.max(0, target - scoreB);
  const rem = Math.max(1, remA + remB);
  return 0.5 + 0.25 * tanh(s / (rem * 0.6));
}

function match_win_probability_fixed_p(
  p: number,
  a: number,
  b: number,
  target: number = 11,
  win_by: number = 2,
): number {
  const key = `${p.toFixed(4)}-${a}-${b}`;
  if (a >= target && a - b >= win_by) return 1.0;
  if (b >= target && b - a >= win_by) return 0.0;
  if (memo.has(key)) return memo.get(key)!;

  // Deuce optimization
  if (a >= target - 1 && b >= target - 1) {
    const denom = p * p + (1 - p) * (1 - p);
    if (denom === 0) return p > 0.5 ? 1.0 : 0.0;
    return (p * p) / denom;
  }

  const res =
    p * match_win_probability_fixed_p(p, a + 1, b, target, win_by) +
    (1 - p) * match_win_probability_fixed_p(p, a, b + 1, target, win_by);
  memo.set(key, res);
  return res;
}

export function blended_point_prob(
  muA: number,
  sigmaA: number,
  muB: number,
  sigmaB: number,
  scoreA: number,
  scoreB: number,
  target: number = 11,
  w_mu: number = 0.2,
): number {
  const base = per_point_base_prob(muA, sigmaA, muB, sigmaB);
  const pts = points_component(scoreA, scoreB, target);
  return w_mu * base + (1 - w_mu) * pts;
}

export function match_prob_with_beta_uncertainty(
  p_blend: number,
  a: number,
  b: number,
  target: number = 11,
  phi: number = 5,
  n_samples: number = 50,
): number {
  const alpha = Math.max(1e-6, p_blend * phi);
  const beta = Math.max(1e-6, (1 - p_blend) * phi);
  const vals: number[] = [];
  memo.clear();
  for (let i = 0; i < n_samples; i++) {
    const p_match = randomBeta(alpha, beta);
    vals.push(match_win_probability_fixed_p(p_match, a, b, target));
  }
  return mean(vals);
}

// ==========================================
// RATING UPDATE LOGIC (Pure Math)
// ==========================================

export function calculate_new_ratings(
  teamA: PlayerStats[],
  teamB: PlayerStats[],
  scoreA: number,
  scoreB: number,
  options: any = {},
): RatingResult {
  const beta = options.beta ?? 4.1667;
  const tau = options.tau ?? 0.05;
  const K = options.K ?? 2.5;
  const lambda_uncertainty = options.lambda_uncertainty ?? 0.6;
  const softmax_temp = options.softmax_temp ?? 5.0;
  const MAX_R = options.MAX_R ?? 100.0;
  const GAMMA_POS = options.GAMMA_POS ?? 2.0;
  const GAMMA_NEG = options.GAMMA_NEG ?? 1.0;

  // 1. Calculate Team Averages
  const muA = (teamA[0].mu + teamA[1].mu) / 2.0;
  const muB = (teamB[0].mu + teamB[1].mu) / 2.0;
  const sigmaA = Math.sqrt(
    (Math.pow(teamA[0].sigma, 2) + Math.pow(teamA[1].sigma, 2)) / 2.0,
  );
  const sigmaB = Math.sqrt(
    (Math.pow(teamB[0].sigma, 2) + Math.pow(teamB[1].sigma, 2)) / 2.0,
  );

  // 2. Probability of Team A winning based on skills
  const denom = Math.sqrt(
    2.0 * (Math.pow(beta, 2) + Math.pow(sigmaA, 2) + Math.pow(sigmaB, 2)),
  );
  const t = (muA - muB) / denom;
  const p_win_A = Phi(t);

  // 3. Determine actual outcome and total team delta
  const actual_A = scoreA > scoreB ? 1 : 0;
  const margin_mult = 1.0 + Math.abs(scoreA - scoreB) / 11.0;

  // Total points to distribute to the team
  const deltaA_team = K * (actual_A - p_win_A) * margin_mult;
  const deltaB_team = -deltaA_team;

  /**
   * SPLIT WEIGHTS HELPER
   */
  function split_weights(team: PlayerStats[]) {
    // Uncertainty component (u)
    const inv_vars = team.map(
      (p) => 1.0 / Math.pow(Math.max(1e-6, p.sigma), 2),
    );
    const sum_inv = inv_vars.reduce((a, b) => a + b, 0) || 1.0;
    const u = inv_vars.map((v) => v / sum_inv);

    // Skill component (s)
    const mus = team.map((p) => p.mu);
    const exps = mus.map((m) => Math.exp(m / Math.max(1e-6, softmax_temp)));
    const s_sum = exps.reduce((a, b) => a + b, 0) || 1.0;
    const s = exps.map((e) => e / s_sum);

    // Blend them using (s) universally to reward/penalize higher rated players more
    const raw = team.map(
      (_, i) => lambda_uncertainty * u[i] + (1 - lambda_uncertainty) * s[i],
    );

    const tot = raw.reduce((a, b) => a + b, 0) || 1.0;
    const w = raw.map((x) => x / tot);
    return { w };
  }

  const splitA = split_weights(teamA);
  const splitB = split_weights(teamB);

  // 4. Calculate specific player updates
  const surprise = Math.abs(actual_A - p_win_A);
  let sigma_shrink_mult = 1.0 - tau * (1.0 + 0.5 * surprise);
  sigma_shrink_mult = Math.max(0.8, sigma_shrink_mult);

  function apply_taper(mu: number, delta: number) {
    if (delta >= 0) {
      let g = (MAX_R - mu) / MAX_R;
      g = Math.max(0.0, Math.min(1.0, g));
      return delta * Math.pow(g, GAMMA_POS);
    } else {
      let l = mu / MAX_R;
      l = Math.max(0.0, Math.min(1.0, l));
      return delta * Math.pow(l, GAMMA_NEG);
    }
  }

  const deltasA = teamA.map((_, i) => deltaA_team * splitA.w[i]);
  const deltasB = teamB.map((_, i) => deltaB_team * splitB.w[i]);

  const teamA_new = teamA.map((p, i) => {
    const raw = deltasA[i];
    const tapered = apply_taper(p.mu, raw);
    return {
      id: p.id,
      mu: Math.max(0.0, Math.min(MAX_R, p.mu + tapered)),
      sigma: Math.max(1.0, p.sigma * sigma_shrink_mult),
    };
  });

  const teamB_new = teamB.map((p, i) => {
    const raw = deltasB[i];
    const tapered = apply_taper(p.mu, raw);
    return {
      id: p.id,
      mu: Math.max(0.0, Math.min(MAX_R, p.mu + tapered)),
      sigma: Math.max(1.0, p.sigma * sigma_shrink_mult),
    };
  });

  return { teamA_new, teamB_new };
}

// ==========================================
// DATABASE UPDATE FUNCTION
// ==========================================

/**
 * Fetches players, calculates new ratings, and updates the DB (ratings + history) for a given match.
 */
export async function update_player_ratings_in_db(
  matchId: number, // Changed to number to match Serial ID
  teamA_ids: number[], // [player1, player2]
  teamB_ids: number[], // [player3, player4]
  scoreA: number,
  scoreB: number,
) {
  // 1. Fetch current ratings from 'ratings' table
  const allPlayerIds = [...teamA_ids, ...teamB_ids];

  const { data: ratingsData, error } = await supabase
    .from("ratings")
    .select("player_id, aura_mu, aura_sigma")
    .in("player_id", allPlayerIds);

  if (error) {
    throw new Error("Failed to fetch player ratings: " + error.message);
  }

  // Map DB data to PlayerStats objects
  const statsMap = new Map<number, PlayerStats>();

  // Populate map from DB
  if (ratingsData) {
    ratingsData.forEach((r) => {
      statsMap.set(r.player_id, {
        id: r.player_id,
        mu: r.aura_mu,
        sigma: r.aura_sigma,
      });
    });
  }

  // Helper to get or create default
  const getStats = (id: number): PlayerStats => {
    if (statsMap.has(id)) return statsMap.get(id)!;
    return { id, mu: DEFAULT_MU, sigma: DEFAULT_SIGMA };
  };

  // Build Team Arrays
  const teamA: PlayerStats[] = teamA_ids.map((id) => getStats(id));
  const teamB: PlayerStats[] = teamB_ids.map((id) => getStats(id));

  // Keep a snapshot of old stats for history logging
  const oldStatsMap = new Map<number, PlayerStats>();
  [...teamA, ...teamB].forEach((p) => oldStatsMap.set(p.id, { ...p }));

  // 2. Calculate New Ratings
  const { teamA_new, teamB_new } = calculate_new_ratings(
    teamA,
    teamB,
    scoreA,
    scoreB,
  );
  const allNewStats = [...teamA_new, ...teamB_new];

  // 3. Perform DB Updates

  // A. Upsert into 'ratings' table
  const ratingUpserts = allNewStats.map((p) => ({
    player_id: p.id,
    aura_mu: p.mu,
    aura_sigma: p.sigma,
    last_updated: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("ratings")
    .upsert(ratingUpserts, { onConflict: "player_id" });

  if (upsertError)
    throw new Error("Failed to update ratings: " + upsertError.message);

  // B. Insert into 'rating_history' table
  const historyInserts = allNewStats.map((p) => {
    const old = oldStatsMap.get(p.id)!;
    return {
      player_id: p.id,
      match_id: matchId,
      old_mu: old.mu,
      old_sigma: old.sigma,
      new_mu: p.mu,
      new_sigma: p.sigma,
    };
  });

  const { error: historyError } = await supabase
    .from("rating_history")
    .insert(historyInserts);

  if (historyError)
    throw new Error("Failed to write rating history: " + historyError.message);

  return { success: true, updated: allNewStats };
}

/**
 * Reverts player ratings to their beginning-of-match state when undoing a
 * completed match. Restores old_mu/old_sigma from rating_history (the values
 * before the match result was applied) into the ratings table and removes
 * that match's history rows. Call only when undoing the final point of a
 * completed match (after update_player_ratings_in_db was applied).
 */
export async function revert_player_ratings_for_match(matchId: number) {
  const { data: historyRows, error: fetchError } = await supabase
    .from("rating_history")
    .select("player_id, old_mu, old_sigma")
    .eq("match_id", matchId);

  if (fetchError)
    throw new Error("Failed to fetch rating history: " + fetchError.message);
  if (!historyRows?.length) return { success: true, reverted: 0 };

  const ratingRestores = historyRows.map((r) => ({
    player_id: r.player_id,
    aura_mu: r.old_mu,
    aura_sigma: r.old_sigma,
    last_updated: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("ratings")
    .upsert(ratingRestores, { onConflict: "player_id" });

  if (upsertError)
    throw new Error("Failed to revert ratings: " + upsertError.message);

  const { error: deleteError } = await supabase
    .from("rating_history")
    .delete()
    .eq("match_id", matchId);

  if (deleteError)
    throw new Error("Failed to remove rating history: " + deleteError.message);

  return { success: true, reverted: historyRows.length };
}
