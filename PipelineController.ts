
import { NBADataProvider } from '../interfaces/DataProvider';
import { AnalyzedGame, GameSchedule, RawPlayerSeasonData, InjuryStatus } from '../types/PipelineTypes';
import { Player, Rotation, ProjectedTeamPerformance, SimulationResult, MarketOdds, BetTicket } from '../types';
import { RotationEngine } from '../RotationEngine';
import { TeamAggregator, ActivePlayer } from '../TeamAggregator';
// FIXED: Import from local './' to ensure we use the updated V2 engines
import { MonteCarloEngine } from './MonteCarloEngine';
import { ValuationService } from './ValuationService';
// Import HybridDataProvider to cast and access getFatigue if needed (or assume Provider interface has it)
import { HybridDataProvider } from './HybridDataProvider';

export class PipelineController {
  private provider: NBADataProvider;

  constructor(provider: NBADataProvider) {
    this.provider = provider;
  }

  /**
   * The Main Loop.
   * Runs the entire Apex predictive stack for a given date.
   */
  public async runAnalysis(date: Date, season: string): Promise<AnalyzedGame[]> {
    console.log(`[APEX] Starting Pipeline for ${date.toISOString()}...`);

    // 1. Ingest Data (Parallel Fetching for Performance)
    const [schedule, allStats, oddsMap, injuries] = await Promise.all([
      this.provider.getSchedule(date),
      this.provider.getAllPlayerStats(season),
      this.provider.getOdds(date),
      this.provider.getInjuryReport()
    ]);

    console.log(`[APEX] Ingested: ${schedule.length} Games, ${allStats.length} Players, ${injuries.length} Reports.`);

    const results: AnalyzedGame[] = [];

    // 2. Process Each Game
    for (const game of schedule) {
      try {
        const analyzedGame = this.processGame(game, allStats, injuries, oddsMap.get(game.gameId));
        if (analyzedGame) {
          results.push(analyzedGame);
        }
      } catch (error) {
        console.error(`[APEX] Error processing game ${game.gameId}:`, error);
      }
    }

    return results;
  }

  private processGame(
    game: GameSchedule, 
    allStats: RawPlayerSeasonData[], 
    injuries: InjuryStatus[],
    marketOdds?: MarketOdds
  ): AnalyzedGame | null {
    
    // A. Build Rosters (Filter & Sort)
    const homeRoster = this.buildRoster(game.homeTeamId, allStats, injuries);
    const awayRoster = this.buildRoster(game.awayTeamId, allStats, injuries);

    // Basic Data Validation
    if (homeRoster.length < 5 || awayRoster.length < 5) {
      console.warn(`[APEX] Skipping ${game.gameId}: Insufficient roster data.`);
      return null;
    }

    // A2. Get Fatigue Data
    let homeFatigue = { isB2B: false, is3in4: false, isRoad: false };
    let awayFatigue = { isB2B: false, is3in4: false, isRoad: true };

    if (this.provider instanceof HybridDataProvider) {
        const hf = this.provider.getFatigue(game.homeTeamId);
        homeFatigue = { isB2B: hf.b2b, is3in4: hf.threeInFour, isRoad: false };
        
        const af = this.provider.getFatigue(game.awayTeamId);
        awayFatigue = { isB2B: af.b2b, is3in4: af.threeInFour, isRoad: true };
    }

    // B. Engine 1: Rotation (Minutes Distribution)
    // "Who is playing and how much?"
    const homeRotation = RotationEngine.distributeMinutes(homeRoster);
    const awayRotation = RotationEngine.distributeMinutes(awayRoster);

    // C. Engine 2: Aggregation (Team Ratings)
    // "How good is this specific group of players?"
    // NOTE: Initial projection does not include Fatigue penalties. 
    // Live UI recalculation (GameCard) will apply them via TeamAggregator.recalculateProjection.
    const homeProj = this.getProjection(homeRoster, homeRotation);
    const awayProj = this.getProjection(awayRoster, awayRotation);

    // D. Engine 3: Monte Carlo (Simulation)
    // "What happens if they play 10,000 times?"
    // Uses the new calibrated engine via ./MonteCarloEngine
    const simResult = MonteCarloEngine.simulate(homeProj, awayProj, 10000);

    // E. Engine 4: Valuation (Financials)
    // "Is the market wrong?"
    let bets: BetTicket[] = [];
    
    // Default to a null market if data is missing (handles pre-market games)
    const activeMarket = marketOdds || {
      spread_line: 0, spread_odds: 0, total_line: 0, total_odds: 0, home_ml: 0, away_ml: 0
    };

    if (marketOdds) {
      // Uses the new capped valuation service via ./ValuationService
      bets = ValuationService.assessValue(simResult, activeMarket);
    }

    // F. Context (Relevant Injuries)
    const gameInjuries = injuries.filter(inj => 
      homeRoster.some(p => p.id === inj.playerId) || 
      awayRoster.some(p => p.id === inj.playerId)
    );

    return {
      gameId: game.gameId,
      matchup: `${game.awayTeamName} @ ${game.homeTeamName}`,
      startTime: game.date,
      homeRoster: homeRoster,
      awayRoster: awayRoster,
      homeFatigue: homeFatigue,
      awayFatigue: awayFatigue,
      homeProjection: homeProj,
      awayProjection: awayProj,
      simulation: simResult,
      market: activeMarket,
      valueBets: bets,
      keyInjuries: gameInjuries.filter(i => i.status !== 'ACTIVE')
    };
  }

  private buildRoster(teamId: string, allStats: RawPlayerSeasonData[], injuries: InjuryStatus[]): Player[] {
    // 1. Filter League stats for this team
    const teamPlayers = allStats.filter(p => p.teamId === teamId);

    // 2. Determine "Depth Order"
    // In V1, we use Minutes Per Game as a heuristic for depth chart position.
    teamPlayers.sort((a, b) => b.minutesPerGame - a.minutesPerGame);

    // 3. Map to Active Player Objects
    return teamPlayers.map((raw, index) => {
      const injury = injuries.find(i => i.playerId === raw.id);
      
      // Determine Status from Injury Report
      let status: 'ACTIVE' | 'OUT' | 'GTD' | 'DOUBTFUL' = 'ACTIVE';
      if (injury) {
        status = injury.status;
      }

      return {
        id: raw.id,
        name: raw.name,
        position: raw.position,
        status: status,
        depth_order: index + 1, // Dynamic depth assignment
        season_minutes_avg: raw.minutesPerGame,
        stats: raw.efficiencyProfile // Pre-calculated per-possession stats
      };
    });
  }

  private getProjection(roster: Player[], rotation: Rotation): ProjectedTeamPerformance {
    // Map the Rotation Entries back to the full Player Profile
    const activePlayers: ActivePlayer[] = rotation.entries.map(entry => {
      const player = roster.find(p => p.id === entry.playerId);
      if (!player) throw new Error(`[APEX] Integrity Error: Player ${entry.playerId} in rotation but not roster.`);
      
      return {
        profile: player.stats,
        projectedMinutes: entry.projected_minutes
      };
    });
    
    return TeamAggregator.aggregate(activePlayers);
  }
}
