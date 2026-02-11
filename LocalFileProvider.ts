
import { NBADataProvider } from '../interfaces/DataProvider';
import { GameSchedule, RawPlayerSeasonData, InjuryStatus } from '../types/PipelineTypes';
import { MarketOdds, Position, PlayerEfficiencyProfile } from '../types';
import { TheOddsApiClient } from './api/TheOddsApiClient';

// Types matching the Python JSON output
interface DBGame {
    gameId: string;
    date: string;
    homeTeamId: string;
    awayTeamId: string;
}

interface DBPlayer {
    id: string;
    name: string;
    team: string;
    gp: number;
    min: number;
    stats: {
        pts_per_100: number;
        ortg: number;
        drtg: number;
        usg_pct: number;
        efg_pct: number;
        tov_pct: number;
        orb_pct: number;
        ftr: number;
    }
}

interface ApexDB {
    games: DBGame[];
    players: Record<string, DBPlayer>;
}

export class LocalFileProvider implements NBADataProvider {
  private oddsClient: TheOddsApiClient;
  private dbCache: ApexDB | null = null;
  private oddsCache: Map<string, MarketOdds> | null = null;

  constructor() {
    this.oddsClient = new TheOddsApiClient();
  }

  // 1. Helper to Load DB
  private async getDB(): Promise<ApexDB> {
    if (this.dbCache) return this.dbCache;
    try {
        const res = await fetch('/data/apex_db.json');
        if (!res.ok) throw new Error("Apex DB not found");
        this.dbCache = await res.json();
        return this.dbCache!;
    } catch (e) {
        console.error("Fatal Error loading Apex DB:", e);
        return { games: [], players: {} };
    }
  }

  // 2. Get Schedule (Merged with Odds)
  public async getSchedule(date: Date): Promise<GameSchedule[]> {
    const db = await this.getDB();
    const dbGames = db.games;

    // Fetch Live Odds
    const oddsGames = await this.oddsClient.fetchOdds();
    this.oddsCache = new Map();

    // Mapping Helper: Odds API Team Name -> Our Team ID (e.g. "Atlanta Hawks" -> "ATL")
    // Note: The Python script saves games with Home/Away ID (e.g. "ATL").
    // The Odds API returns "Atlanta Hawks".
    // Strategy: We iterate our DB Games (Source of Truth) and fuzzy match the Odds Games.
    
    // Simple reverse map for Odds API matching
    const teamNameMap: Record<string, string> = {
        'ATL': 'Atlanta Hawks', 'BOS': 'Boston Celtics', 'BKN': 'Brooklyn Nets', 'CHA': 'Charlotte Hornets',
        'CHI': 'Chicago Bulls', 'CLE': 'Cleveland Cavaliers', 'DAL': 'Dallas Mavericks', 'DEN': 'Denver Nuggets',
        'DET': 'Detroit Pistons', 'GSW': 'Golden State Warriors', 'HOU': 'Houston Rockets', 'IND': 'Indiana Pacers',
        'LAC': 'Los Angeles Clippers', 'LAL': 'Los Angeles Lakers', 'MEM': 'Memphis Grizzlies', 'MIA': 'Miami Heat',
        'MIL': 'Milwaukee Bucks', 'MIN': 'Minnesota Timberwolves', 'NOP': 'New Orleans Pelicans', 'NYK': 'New York Knicks',
        'OKC': 'Oklahoma City Thunder', 'ORL': 'Orlando Magic', 'PHI': 'Philadelphia 76ers', 'PHX': 'Phoenix Suns',
        'POR': 'Portland Trail Blazers', 'SAC': 'Sacramento Kings', 'SAS': 'San Antonio Spurs', 'TOR': 'Toronto Raptors',
        'UTA': 'Utah Jazz', 'WAS': 'Washington Wizards'
    };

    const schedule: GameSchedule[] = [];

    for (const g of dbGames) {
        // Find matching odds object
        // We match based on Home Team Name
        const homeName = teamNameMap[g.homeTeamId];
        const matchedOdds = oddsGames.find(og => og.home_team === homeName);

        if (matchedOdds) {
            const market = this.oddsClient.extractMarketOdds(matchedOdds);
            this.oddsCache.set(g.gameId, market);
        }

        schedule.push({
            gameId: g.gameId,
            date: g.date, // Python script sets this to today's date
            homeTeamId: g.homeTeamId,
            homeTeamName: homeName || g.homeTeamId,
            awayTeamId: g.awayTeamId,
            awayTeamName: teamNameMap[g.awayTeamId] || g.awayTeamId
        });
    }

    return schedule;
  }

  // 3. Get Odds (Return Cached Map)
  public async getOdds(date: Date): Promise<Map<string, MarketOdds>> {
    if (!this.oddsCache) await this.getSchedule(date);
    return this.oddsCache || new Map();
  }

  // 4. Get Player Stats (From DB)
  public async getAllPlayerStats(season: string): Promise<RawPlayerSeasonData[]> {
    const db = await this.getDB();
    const players: RawPlayerSeasonData[] = [];

    Object.values(db.players).forEach(p => {
        // ID Hash for position if missing
        const positions: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        const derivedPos = positions[parseInt(p.id) % 5];
        
        // MPG calc
        const mpg = (p.min && p.gp > 0) ? (p.min / p.gp) : 15.0;

        players.push({
            id: p.id,
            name: p.name,
            teamId: p.team,
            position: derivedPos,
            minutesPerGame: mpg,
            gamesPlayed: p.gp,
            efficiencyProfile: {
                ...p.stats,
                drb_pct: 12.0, // Default constants for missing fields
                pace_impact: 100.0,
                bpm: 0,
                ast_per_100: 0,
                stl_per_100: 0,
                blk_per_100: 0
            } as PlayerEfficiencyProfile
        });
    });

    return players;
  }

  public async getInjuryReport(): Promise<InjuryStatus[]> {
    // Static placeholder for phase 6
    return [
        { playerId: '2544', status: 'GTD', details: 'Ankle' }
    ];
  }
}
