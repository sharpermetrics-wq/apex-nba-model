
import { MarketOdds } from '../types';
import { GameSchedule, RawPlayerSeasonData, InjuryStatus } from '../types/PipelineTypes';

export interface NBADataProvider {
  /**
   * Fetches the games for a specific date.
   */
  getSchedule(date: Date): Promise<GameSchedule[]>;

  /**
   * Fetches active roster stats for the entire league.
   * Typically cached or fetched daily.
   */
  getAllPlayerStats(season: string): Promise<RawPlayerSeasonData[]>;

  /**
   * Fetches current market lines for specific games.
   * Returns a Map keyed by GameID for O(1) lookup during the pipeline loop.
   */
  getOdds(date: Date): Promise<Map<string, MarketOdds>>;

  /**
   * Fetches the latest official injury report.
   */
  getInjuryReport(): Promise<InjuryStatus[]>;
}
