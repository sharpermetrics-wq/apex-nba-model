
import { RawGameLog, PlayerEfficiencyProfile } from './types';

export class StatsNormalizer {
  
  /**
   * Converts a raw game log into a normalized per-100 possession profile.
   * Handles the physics of cleaning noisy single-game data.
   */
  public static normalize(log: RawGameLog): PlayerEfficiencyProfile {
    
    // 1. Calculate Possessions for this specific stint
    // Formula: Minutes * (Team Pace / 48)
    const estimatedPossessions = log.minutes * (log.team_pace / 48);
    
    // Safety check to avoid division by zero
    const safePossessions = estimatedPossessions > 0 ? estimatedPossessions : 1;

    // 2. Calculate Usage Rate (The Formula provided)
    // USG% = 100 * ((FGA + 0.44 * FTA + TOV) * (TeamMP / 5)) / (MP * (TeamFGA + 0.44 * TeamFTA + TeamTOV))
    const teamPossessionsTerm = log.team_fga + 0.44 * log.team_fta + log.team_tov;
    const playerPossessionsTerm = log.fga + 0.44 * log.fta + log.tov;
    
    let usg_pct = 0;
    if (log.minutes > 0 && teamPossessionsTerm > 0) {
      usg_pct = 100 * (playerPossessionsTerm * (log.team_mp / 5)) / (log.minutes * teamPossessionsTerm);
    }

    // 3. Normalize Counting Stats to Per 100
    const pts_per_100 = (log.points / safePossessions) * 100;
    const ast_per_100 = 0; // Not provided in RawGameLog, simplified for this scope
    const stl_per_100 = (log.stl / safePossessions) * 100;
    const blk_per_100 = (log.blk / safePossessions) * 100;

    // 4. Efficiency Metrics
    // eFG% = (FGM + 0.5 * 3PM) / FGA. 
    // Note: RawGameLog in prompt didn't strictly ask for 3PM, assuming FGM for now or simplified.
    // If strict eFG is needed, we need 3PM. Assuming standard FG% for this specific interface if 3PM missing.
    const efg_pct = log.fga > 0 ? (log.fgm / log.fga) : 0; 
    
    const tov_pct = playerPossessionsTerm > 0 ? (log.tov / playerPossessionsTerm) * 100 : 0;
    
    // ORB/DRB Pct are complex team-dependent stats, simplified here as rates per possession
    // Ideally requires (Team ORB + Opp DRB) context.
    const orb_pct = (log.orb / safePossessions) * 100; // Simplified estimate
    const drb_pct = (log.drb / safePossessions) * 100; // Simplified estimate

    const ftr = log.fga > 0 ? log.fta / log.fga : 0;

    // 5. Ratings Estimates (In a real system, these come from regressions, here we approximate)
    // ORtg ≈ Pts Per 100 Individual
    const ortg = pts_per_100; 
    
    // DRtg - simplified placeholder as we don't have Opponent stats in RawLog
    const drtg = 110; 

    return {
      efg_pct,
      usg_pct,
      orb_pct,
      drb_pct,
      tov_pct,
      ftr,
      three_par: 0, // Defaulting as RawGameLog doesn't have 3PA info
      pts_per_100,
      ast_per_100,
      stl_per_100,
      blk_per_100,
      ortg,
      drtg,
      pace_impact: log.team_pace, // Assuming player plays at team pace
      bpm: 0 // Requires league context
    };
  }
}
