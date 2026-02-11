
import { TrackedBet, BetCategory } from '../types/BetTypes';

export interface RecordStats {
  wins: number;
  losses: number;
  pushes: number;
  net: number; // Added Net Units tracking
}

export interface PortfolioMetrics {
  netUnits: number;
  roi: number;
  activeRisk: number;
  totalRisked: number;
  categoryRecords: Record<BetCategory, RecordStats>;
  tierRecords: Record<string, RecordStats>; // Added Tier Breakdown
}

export class StatsCalculator {

  public static compute(bets: TrackedBet[]): PortfolioMetrics {
    let netUnits = 0;
    let totalRisked = 0;
    let activeRisk = 0;

    // Helper to init stats object
    const createStat = (): RecordStats => ({ wins: 0, losses: 0, pushes: 0, net: 0 });

    const records: Record<BetCategory, RecordStats> = {
      'Spread': createStat(),
      'Over': createStat(),
      'Under': createStat(),
      'Moneyline': createStat()
    };

    // Initialize Tier Buckets with Explicit Outlier Tracking
    const tiers: Record<string, RecordStats> = {
        'STANDARD': createStat(),
        'LEAN': createStat(),
        'OUTLIER': createStat()
    };

    for (const bet of bets) {
      if (bet.result === 'Pending') {
        activeRisk += bet.units;
        continue;
      }

      // 1. Resolve Category
      const cat = bet.category;
      if (!records[cat]) records[cat] = createStat(); 
      const catStats = records[cat];

      // 2. Resolve Tier (Use persisted grade or fallback for legacy)
      let tierKey = 'LEAN';
      if (bet.grade) {
          tierKey = bet.grade;
      } else {
          // Legacy Backup: fuzzy match for old bets without grade property
          if (Math.abs(bet.units - 1.0) < 0.2) tierKey = 'STANDARD';
          else if (Math.abs(bet.units - 0.75) < 0.2) tierKey = 'LEAN';
          else if (bet.units === 0) tierKey = 'OUTLIER';
      }
      
      // Safety for new keys if added later
      if (!tiers[tierKey]) tiers[tierKey] = createStat();
      const tierStats = tiers[tierKey];

      // 3. Update Counts
      if (bet.result === 'Win') {
          catStats.wins++;
          tierStats.wins++;
      } else if (bet.result === 'Loss') {
          catStats.losses++;
          tierStats.losses++;
      } else if (bet.result === 'Push') {
          catStats.pushes++;
          tierStats.pushes++;
      }

      // 4. Financials (Skip Pushes)
      if (bet.result === 'Push') continue;

      totalRisked += bet.units;
      let profit = 0;

      if (bet.result === 'Win') {
        const decimal = this.convertToDecimal(bet.odds);
        profit = bet.units * (decimal - 1);
      } else if (bet.result === 'Loss') {
        profit = -bet.units;
      }

      // Aggregate
      netUnits += profit;
      catStats.net += profit;
      tierStats.net += profit;
    }

    const roi = totalRisked > 0 ? (netUnits / totalRisked) * 100 : 0;

    return {
      netUnits,
      roi,
      activeRisk,
      totalRisked,
      categoryRecords: records,
      tierRecords: tiers
    };
  }

  private static convertToDecimal(odds: number): number {
    if (odds > 0) {
      return (odds / 100) + 1;
    } else {
      return (100 / Math.abs(odds)) + 1;
    }
  }
}
