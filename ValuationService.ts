import { SimulationResult, MarketOdds, BetTicket, BetGrade } from './types';

export class ValuationService {

  private static KELLY_MULTIPLIER = 0.25; // Fractional Kelly (Conservative)

  private static convertAmericanToDecimal(odds: number): number {
    if (odds > 0) {
      return (odds / 100) + 1;
    } else {
      return (100 / Math.abs(odds)) + 1;
    }
  }

  private static convertAmericanToImpliedProb(odds: number): number {
    const decimal = this.convertAmericanToDecimal(odds);
    return 1 / decimal;
  }

  private static getGrade(edge: number): BetGrade {
    if (edge >= 0.05) return 'STANDARD';
    if (edge >= 0.03) return 'LEAN';
    if (edge >= 0.015) return 'LEAN';
    return 'PASS';
  }

  /**
   * Calculates specific bet recommendations based on Sim Result vs Market
   */
  public static assessValue(simResult: SimulationResult, market: MarketOdds): BetTicket[] {
    const tickets: BetTicket[] = [];

    // --- 1. MONEYLINE EVALUATION ---
    // Home ML
    const homeImplied = this.convertAmericanToImpliedProb(market.home_ml);
    const homeModelProb = simResult.homeWinPct;
    const homeDecimal = this.convertAmericanToDecimal(market.home_ml);
    
    const homeEdge = homeModelProb - homeImplied;
    
    if (homeEdge > 0) {
      // Kelly: (bp - q) / b  where b = odds-1
      const kelly = ((homeDecimal - 1) * homeModelProb - (1 - homeModelProb)) / (homeDecimal - 1);
      tickets.push({
        betType: 'MONEYLINE',
        description: `Home ML (${market.home_ml})`,
        marketPrice: market.home_ml,
        impliedProb: homeImplied,
        modelProb: homeModelProb,
        edgePercentage: homeEdge,
        kellyUnits: Math.max(0, kelly * this.KELLY_MULTIPLIER * 100), // Units based on % of bankroll
        grade: this.getGrade(homeEdge)
      });
    }

    // Away ML
    const awayImplied = this.convertAmericanToImpliedProb(market.away_ml);
    const awayModelProb = 1 - simResult.homeWinPct;
    const awayDecimal = this.convertAmericanToDecimal(market.away_ml);
    const awayEdge = awayModelProb - awayImplied;

    if (awayEdge > 0) {
        const kelly = ((awayDecimal - 1) * awayModelProb - (1 - awayModelProb)) / (awayDecimal - 1);
        tickets.push({
          betType: 'MONEYLINE',
          description: `Away ML (${market.away_ml})`,
          marketPrice: market.away_ml,
          impliedProb: awayImplied,
          modelProb: awayModelProb,
          edgePercentage: awayEdge,
          kellyUnits: Math.max(0, kelly * this.KELLY_MULTIPLIER * 100),
          grade: this.getGrade(awayEdge)
        });
    }

    // --- 2. SPREAD EVALUATION ---
    // To properly calculate spread probability, we can't just use mean margin.
    // We strictly should recount the scatterData, but since we didn't save all 10k points in the interface,
    // we will use a Normal CDF approximation using the standard deviation of the margin.
    // However, for this Phase, let's assume the Spread Win Pct is approximated by the mean shift 
    // or by recounting if we had the data. 
    // Since we don't pass the full 10k array to the frontend, let's just use the ProjectedSpread 
    // compared to Market Line to determine direction, and estimate WinProb via a simple model.
    // Margin StdDev in NBA is approx 13.5 points.
    
    const MARGIN_STD_DEV = 13.5;
    const marginDiff = simResult.projectedSpread - market.spread_line; // (Away - Home) - MarketLine
    // Market Line: -4.5 (Home favored). 
    // If Model Spread is -10 (Home wins by 10). Diff = -10 - (-4.5) = -5.5.
    // This logic is tricky. Let's simplify:
    
    // We bet Home if Model says Home wins by MORE than Market.
    // Model Home Margin = -1 * projectedSpread (since projSpread is Away-Home).
    const modelHomeMargin = -1 * simResult.projectedSpread;
    const marketHomeMargin = -1 * market.spread_line; // -4.5 becomes 4.5 points favored
    
    // Let's use a CDF approximation function
    const cdf = (x: number, mean: number, std: number) => {
        return 0.5 * (1 + (Math.sign(x - mean) * Math.sqrt(1 - Math.exp(-2 * Math.pow(x - mean, 2) / (Math.PI * Math.pow(std, 2))))));
    };

    // Probability Home Covers (-4.5) -> Home wins by > 4.5
    // P(Margin > 4.5) where Margin ~ N(modelHomeMargin, 13.5)
    const probHomeCover = 1 - cdf(marketHomeMargin, modelHomeMargin, MARGIN_STD_DEV);
    const probAwayCover = 1 - probHomeCover;

    const spreadImplied = this.convertAmericanToImpliedProb(market.spread_odds);
    const spreadDecimal = this.convertAmericanToDecimal(market.spread_odds);

    // Add Home Bet?
    if (probHomeCover > spreadImplied) {
        const edge = probHomeCover - spreadImplied;
        const kelly = ((spreadDecimal - 1) * probHomeCover - (1 - probHomeCover)) / (spreadDecimal - 1);
        tickets.push({
            betType: 'SPREAD',
            description: `Home ${market.spread_line}`,
            marketPrice: market.spread_odds,
            impliedProb: spreadImplied,
            modelProb: probHomeCover,
            edgePercentage: edge,
            kellyUnits: Math.max(0, kelly * this.KELLY_MULTIPLIER * 100),
            grade: this.getGrade(edge)
        });
    } 
    // Add Away Bet?
    else if (probAwayCover > spreadImplied) {
        const edge = probAwayCover - spreadImplied;
        const kelly = ((spreadDecimal - 1) * probAwayCover - (1 - probAwayCover)) / (spreadDecimal - 1);
        tickets.push({
            betType: 'SPREAD',
            description: `Away ${-1 * market.spread_line > 0 ? '+' : ''}${-1 * market.spread_line}`,
            marketPrice: market.spread_odds,
            impliedProb: spreadImplied,
            modelProb: probAwayCover,
            edgePercentage: edge,
            kellyUnits: Math.max(0, kelly * this.KELLY_MULTIPLIER * 100),
            grade: this.getGrade(edge)
        });
    }

    // --- 3. TOTAL EVALUATION ---
    // P(Total > MarketLine)
    // Total StdDev approx 18.0
    const TOTAL_STD_DEV = 18.0;
    const probOver = 1 - cdf(market.total_line, simResult.projectedTotal, TOTAL_STD_DEV);
    const probUnder = 1 - probOver;
    
    const totalImplied = this.convertAmericanToImpliedProb(market.total_odds);
    const totalDecimal = this.convertAmericanToDecimal(market.total_odds);

    if (probOver > totalImplied) {
        const edge = probOver - totalImplied;
        const kelly = ((totalDecimal - 1) * probOver - (1 - probOver)) / (totalDecimal - 1);
         tickets.push({
            betType: 'TOTAL',
            description: `Over ${market.total_line}`,
            marketPrice: market.total_odds,
            impliedProb: totalImplied,
            modelProb: probOver,
            edgePercentage: edge,
            kellyUnits: Math.max(0, kelly * this.KELLY_MULTIPLIER * 100),
            grade: this.getGrade(edge)
        });
    } else if (probUnder > totalImplied) {
        const edge = probUnder - totalImplied;
        const kelly = ((totalDecimal - 1) * probUnder - (1 - probUnder)) / (totalDecimal - 1);
         tickets.push({
            betType: 'TOTAL',
            description: `Under ${market.total_line}`,
            marketPrice: market.total_odds,
            impliedProb: totalImplied,
            modelProb: probUnder,
            edgePercentage: edge,
            kellyUnits: Math.max(0, kelly * this.KELLY_MULTIPLIER * 100),
            grade: this.getGrade(edge)
        });
    }

    // Sort by Grade Value
    return tickets.sort((a, b) => b.edgePercentage - a.edgePercentage);
  }
}