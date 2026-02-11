import { ProjectedTeamPerformance, SimulationResult } from './types';

export class MonteCarloEngine {
  // Standard Deviation assumptions based on NBA variances
  private static PACE_STD_DEV = 3.8;
  private static ORTG_STD_DEV = 11.5; 
  private static CORRELATION_COEFFICIENT = 0.25; // How much team efficiencies track together

  /**
   * Generates two normally distributed random numbers using the Box-Muller transform.
   * Returns [z1, z2] (Standard Normal: Mean 0, Variance 1)
   */
  private static boxMuller(): [number, number] {
    let u = 0, v = 0;
    while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while (v === 0) v = Math.random();
    const z1 = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    const z2 = Math.sqrt(-2.0 * Math.log(u)) * Math.sin(2.0 * Math.PI * v);
    return [z1, z2];
  }

  public static simulate(
    homeProj: ProjectedTeamPerformance,
    awayProj: ProjectedTeamPerformance,
    numSims: number = 10000
  ): SimulationResult {
    
    // 1. Determine Baseline Pace
    // Weighted Average of both teams' projected paces
    const baselinePace = (homeProj.projectedPace + awayProj.projectedPace) / 2;

    let homeWins = 0;
    let totalMargin = 0; // Away - Home
    let totalPoints = 0;
    let homeScoreSum = 0;
    let awayScoreSum = 0;

    // We keep a subset of data for scatter plots (max 500 points to keep UI fast)
    const scatterData: { home: number; away: number }[] = [];
    const scatterInterval = Math.floor(numSims / 500);

    for (let i = 0; i < numSims; i++) {
      // A. Randomize Pace
      const [zPace, zUnused] = this.boxMuller();
      const simPace = baselinePace + (zPace * this.PACE_STD_DEV);

      // B. Randomize Efficiencies with Correlation
      // Z1 represents the "Game Environment" factor (affects both)
      // Z2 represents the specific variance for Away
      const [z1, z2] = this.boxMuller();
      
      // Home Performance (Standard deviation applied to Home ORtg)
      const homeORtgSim = homeProj.projectedORtg + (z1 * this.ORTG_STD_DEV);

      // Away Performance (Correlated to Home's performance)
      // Formula: X2 = mu2 + sigma2 * (rho * Z1 + sqrt(1 - rho^2) * Z2)
      const rho = this.CORRELATION_COEFFICIENT;
      const correlatedZ = (rho * z1) + (Math.sqrt(1 - rho * rho) * z2);
      
      const awayORtgSim = awayProj.projectedORtg + (correlatedZ * this.ORTG_STD_DEV);

      // C. Calculate Final Scores
      const homeScore = (simPace / 100) * homeORtgSim;
      const awayScore = (simPace / 100) * awayORtgSim;
      
      // Update Aggregates
      if (homeScore > awayScore) homeWins++;
      
      homeScoreSum += homeScore;
      awayScoreSum += awayScore;
      totalPoints += (homeScore + awayScore);
      totalMargin += (awayScore - homeScore);

      // Store scatter data occasionally
      if (i % scatterInterval === 0) {
        scatterData.push({ home: homeScore, away: awayScore });
      }
    }

    return {
      homeWinPct: homeWins / numSims,
      projectedSpread: totalMargin / numSims, // Away - Home
      projectedTotal: totalPoints / numSims,
      homeScoreAvg: homeScoreSum / numSims,
      awayScoreAvg: awayScoreSum / numSims,
      scatterData,
      debug: {
        rawPace: baselinePace,
        regressedPace: baselinePace,
        rawHomeORtg: homeProj.projectedORtg,
        hcaHomeORtg: homeProj.projectedORtg,
        regressedHomeORtg: homeProj.projectedORtg,
        rawAwayORtg: awayProj.projectedORtg,
        hcaAwayORtg: awayProj.projectedORtg,
        regressedAwayORtg: awayProj.projectedORtg,
        projectedRawTotal: totalPoints / numSims,
        projectedCompressedTotal: totalPoints / numSims,
        paceFriction: 0
      }
    };
  }
}