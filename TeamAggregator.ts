
import { PlayerEfficiencyProfile, ProjectedTeamPerformance } from './types';

export interface ActivePlayer {
  profile: PlayerEfficiencyProfile;
  projectedMinutes: number;
}

export class TeamAggregator {

  /**
   * Aggregates a roster of players into a single Team Projection.
   * 
   * LOGIC:
   * - Offensive Rating & Four Factors: Weighted by USAGE * MINUTES (Possession Volume).
   * - Defensive Rating & Pace: Weighted by MINUTES (Time on Court).
   */
  public static aggregate(roster: ActivePlayer[]): ProjectedTeamPerformance {
    let totalMinutes = 0;
    let totalUsageLoad = 0;

    // Accumulators
    let weightedORtg = 0;
    let weightedDRtg = 0;
    let weightedPace = 0;
    
    // Four Factors Accumulators
    let weightedEFG = 0;
    let weightedTOV = 0;
    let weightedORB = 0;
    let weightedDRB = 0;
    let weightedFTR = 0;
    
    // V3.0 Accumulator
    let weighted3PAr = 0;

    roster.forEach(player => {
      const mins = player.projectedMinutes;
      const stats = player.profile;
      
      if (mins <= 0) return;

      // 1. Calculate Usage Load for this player (The "Gravity" they exert)
      // A 30% USG player impacts the offensive efficiency 3x more than a 10% USG player per minute.
      const usageLoad = stats.usg_pct * mins;

      // 2. Accumulate Minute-Weighted Stats (Defense, Pace)
      weightedDRtg += stats.drtg * mins;
      weightedPace += stats.pace_impact * mins;
      
      // 3. Accumulate Usage-Weighted Stats (Offense, Four Factors)
      weightedORtg += stats.ortg * usageLoad;
      weightedEFG += stats.efg_pct * usageLoad;
      weightedTOV += stats.tov_pct * usageLoad;
      weightedORB += stats.orb_pct * usageLoad;
      weightedDRB += stats.drb_pct * usageLoad;
      weightedFTR += stats.ftr * usageLoad;
      weighted3PAr += (stats.three_par || 0) * usageLoad;

      totalMinutes += mins;
      totalUsageLoad += usageLoad;
    });

    // Avoid division by zero
    const safeMinutes = totalMinutes > 0 ? totalMinutes : 1;
    const safeUsage = totalUsageLoad > 0 ? totalUsageLoad : 1;

    return {
      projectedORtg: weightedORtg / safeUsage,
      projectedDRtg: weightedDRtg / safeMinutes,
      projectedPace: weightedPace / safeMinutes,
      projectedThreeRate: weighted3PAr / safeUsage,
      netRating: (weightedORtg / safeUsage) - (weightedDRtg / safeMinutes),
      compositeFourFactors: {
        eFG: weightedEFG / safeUsage,
        tov: weightedTOV / safeUsage,
        orb: weightedORB / safeUsage,
        drb: weightedDRB / safeUsage,
        ftr: weightedFTR / safeUsage
      }
    };
  }
}
