
import { NBADataProvider } from '../interfaces/DataProvider';
import { GameSchedule, RawPlayerSeasonData, InjuryStatus } from '../types/PipelineTypes';
import { MarketOdds, Position, PlayerEfficiencyProfile } from '../types';

export class MockDataProvider implements NBADataProvider {
  
  // Generic profile templates to generate roster depth quickly
  private static STAR_PROFILE: PlayerEfficiencyProfile = {
    efg_pct: 0.55, usg_pct: 30.0, orb_pct: 2.5, drb_pct: 12.0, tov_pct: 11.0, ftr: 0.35, three_par: 0.40, pts_per_100: 32.0, ast_per_100: 7.5, stl_per_100: 1.5, blk_per_100: 0.5, bpm: 6.5, ortg: 118.0, drtg: 108.0, pace_impact: 100.0
  };

  private static ROLE_PLAYER_PROFILE: PlayerEfficiencyProfile = {
    efg_pct: 0.52, usg_pct: 15.0, orb_pct: 4.5, drb_pct: 10.0, tov_pct: 9.0, ftr: 0.20, three_par: 0.35, pts_per_100: 16.0, ast_per_100: 3.5, stl_per_100: 1.0, blk_per_100: 0.4, bpm: 0.5, ortg: 110.0, drtg: 110.0, pace_impact: 98.0
  };

  public async getSchedule(date: Date): Promise<GameSchedule[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));

    return [
      {
        gameId: 'g1', date: new Date().toISOString(),
        homeTeamId: 'GSW', homeTeamName: 'Golden State Warriors',
        awayTeamId: 'LAL', awayTeamName: 'Los Angeles Lakers'
      },
      {
        gameId: 'g2', date: new Date().toISOString(),
        homeTeamId: 'BOS', homeTeamName: 'Boston Celtics',
        awayTeamId: 'MIA', awayTeamName: 'Miami Heat'
      },
      {
        gameId: 'g3', date: new Date().toISOString(),
        homeTeamId: 'DAL', homeTeamName: 'Dallas Mavericks',
        awayTeamId: 'PHX', awayTeamName: 'Phoenix Suns'
      }
    ];
  }

  public async getOdds(date: Date): Promise<Map<string, MarketOdds>> {
    const odds = new Map<string, MarketOdds>();
    
    // Game 1: Market likes GSW by 5.5, Total 235
    odds.set('g1', {
      spread_line: -5.5, spread_odds: -110,
      total_line: 235.5, total_odds: -110,
      home_ml: -240, away_ml: +195
    });

    // Game 2: Market likes BOS by 8.5 (Heavy Favorite)
    odds.set('g2', {
      spread_line: -8.5, spread_odds: -110,
      total_line: 218.0, total_odds: -110,
      home_ml: -380, away_ml: +300
    });

    // Game 3: Tight game
    odds.set('g3', {
      spread_line: -1.5, spread_odds: -110,
      total_line: 228.0, total_odds: -110,
      home_ml: -125, away_ml: +105
    });

    return odds;
  }

  public async getAllPlayerStats(season: string): Promise<RawPlayerSeasonData[]> {
    const teams = ['GSW', 'LAL', 'BOS', 'MIA', 'DAL', 'PHX'];
    const roster: RawPlayerSeasonData[] = [];

    teams.forEach(teamId => {
      // Generate 1 Star
      roster.push({
        id: `${teamId}-star`, name: `${teamId} Star`, teamId, position: 'PG', minutesPerGame: 36.0, gamesPlayed: 50, efficiencyProfile: MockDataProvider.STAR_PROFILE
      });
      // Generate 4 Starters
      ['SG', 'SF', 'PF', 'C'].forEach((pos, idx) => {
        roster.push({
          id: `${teamId}-starter-${idx}`, name: `${teamId} Starter ${pos}`, teamId, position: pos as Position, minutesPerGame: 30.0, gamesPlayed: 55, efficiencyProfile: MockDataProvider.ROLE_PLAYER_PROFILE
        });
      });
      // Generate 3 Bench
      ['PG', 'SF', 'C'].forEach((pos, idx) => {
         roster.push({
          id: `${teamId}-bench-${idx}`, name: `${teamId} Bench ${pos}`, teamId, position: pos as Position, minutesPerGame: 18.0, gamesPlayed: 45, efficiencyProfile: { ...MockDataProvider.ROLE_PLAYER_PROFILE, usg_pct: 18.0, ortg: 105.0 }
        });
      });
    });

    return roster;
  }

  public async getInjuryReport(): Promise<InjuryStatus[]> {
    return [
      { playerId: 'LAL-star', status: 'OUT', details: 'Load Management' }, // Creates massive value for GSW
      { playerId: 'MIA-starter-2', status: 'GTD', details: 'Ankle' }
    ];
  }
}
