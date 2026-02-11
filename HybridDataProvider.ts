
import { NBADataProvider } from '../interfaces/DataProvider';
import { GameSchedule, RawPlayerSeasonData, InjuryStatus } from '../types/PipelineTypes';
import { MarketOdds } from '../types';

export interface RawOddsGame {
  [key: string]: any;
}

export class HybridDataProvider implements NBADataProvider {
  private playerStats: RawPlayerSeasonData[];
  private rawOddsData: RawOddsGame[]; 
  private fatigueData: Record<string, any> | null;
  
  // Cache
  private scheduleCache: GameSchedule[] | null = null;
  private oddsCache: Map<string, MarketOdds> | null = null;

  constructor(stats: RawPlayerSeasonData[], rawOddsData: RawOddsGame[], fatigueData?: Record<string, any> | null) {
    this.playerStats = stats;
    this.rawOddsData = rawOddsData;
    this.fatigueData = fatigueData || null;
  }

  // --- INTELLIGENT KEY EXTRACTOR ---
  private getValue(obj: any, keys: string[]): any {
    const lowerKeys = keys.map(k => k.toLowerCase());
    for (const key of Object.keys(obj)) {
        if (lowerKeys.includes(key.toLowerCase())) {
            return obj[key];
        }
    }
    return undefined;
  }

  // New Helper for Fatigue
  public getFatigue(teamId: string): { b2b: boolean, threeInFour: boolean } {
      if (!this.fatigueData) return { b2b: false, threeInFour: false };
      
      const teamData = this.fatigueData[teamId];
      if (!teamData) return { b2b: false, threeInFour: false };

      return {
          b2b: !!teamData.isB2B,
          threeInFour: !!teamData.is3in4
      };
  }

  public async getSchedule(date: Date): Promise<GameSchedule[]> {
    if (this.scheduleCache) return this.scheduleCache;

    const schedule: GameSchedule[] = [];
    this.oddsCache = new Map<string, MarketOdds>();

    if (!Array.isArray(this.rawOddsData)) {
        console.error("Odds Data is not an array");
        return [];
    }

    // --- FORENSIC LOGGING START ---
    console.group("🔎 APEX DATA FORENSICS");
    const now = new Date();
    
    console.log(`SYSTEM TIME: ${now.toISOString()}`);
    
    const diagnostics: any[] = [];

    for (const g of this.rawOddsData) {
        // 1. EXTRACT TIMING
        const commenceTime = this.getValue(g, ['commence_time', 'CommenceTime', 'date', 'Date', 'time', 'start']);
        
        let status = 'PENDING';

        // 3. EXTRACT NAMES
        const homeNameRaw = this.getValue(g, [
            'home_team', 'HomeTeam', 'home', 'hometeam', 'team_home', 'team1', 'host', 
            'homeTeamId', 'homeTeamName', 'hometeamname', 'hometeamid'
        ]);
        const awayNameRaw = this.getValue(g, [
            'away_team', 'AwayTeam', 'away', 'awayteam', 'team_away', 'team2', 'visitor', 
            'awayTeamId', 'awayTeamName', 'awayteamname', 'awayteamid'
        ]);

        if (!homeNameRaw || !awayNameRaw) {
             console.warn("[HybridDataProvider] Skipping item: Missing team names", g);
             continue;
        }

        const label = `${awayNameRaw} @ ${homeNameRaw}`;
        status = 'ACCEPTED';
        diagnostics.push({ Game: label, Date: commenceTime, Status: status });

        // 4. MAPPING LOGIC
        const existingId = this.getValue(g, ['id', 'game_id', 'GameID', 'ID', 'gameId']);
        const gameId = existingId || `${homeNameRaw}_vs_${awayNameRaw}_${Math.random().toString(36).substr(2, 5)}`;
        
        const homeId = this.fuzzyMatchTeam(String(homeNameRaw));
        const awayId = this.fuzzyMatchTeam(String(awayNameRaw));

        if (homeId === 'UNK' || awayId === 'UNK') {
            console.warn(`[HybridDataProvider] Failed mapping: "${homeNameRaw}" (${homeId}) vs "${awayNameRaw}" (${awayId})`);
            continue;
        }

        schedule.push({
            gameId: gameId,
            date: commenceTime || new Date().toISOString(),
            homeTeamId: homeId,
            homeTeamName: String(homeNameRaw),
            awayTeamId: awayId,
            awayTeamName: String(awayNameRaw)
        });

        // 5. ODDS EXTRACTION (ROBUST STRATEGY)
        let homeSpread: number | null = null;
        let total: number | null = null;
        let homeML: number | null = null;
        let awayML: number | null = null;

        // Sharp (Pinnacle) Placeholders
        let pinSpread: number | null = null;
        let pinTotal: number | null = null;
        let pinHomeML: number | null = null;
        let pinAwayML: number | null = null;

        // Helpers
        const toAmerican = (decimal: number) => {
            if (!decimal) return 0;
            if (decimal === 1) return -10000; // Edge case
            if (decimal >= 2.0) return Math.round((decimal - 1) * 100);
            return Math.round(-100 / (decimal - 1));
        };

        const parseProbableOdds = (val: any) => {
            const num = Number(val);
            if (isNaN(num) || num === 0) return null;
            // If absolute value < 50, assume Decimal Odds and convert
            if (Math.abs(num) < 50) return toAmerican(num);
            return Math.round(num);
        };

        const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

        // STRATEGY A: NESTED BOOKMAKERS (The Odds API)
        if (Array.isArray(g.bookmakers)) {
            // 1. RETAIL / MARKET LINE
            // Sort bookmakers by sharpness preference
            const preferred = ['pinnacle', 'draftkings', 'fanduel', 'williamhill', 'betmgm', 'caesars', 'pointsbet'];
            const sortedBooks = [...g.bookmakers].sort((a, b) => {
                const idxA = preferred.indexOf(a.key);
                const idxB = preferred.indexOf(b.key);
                // -1 means not in list (put at end)
                const rankA = idxA === -1 ? 999 : idxA;
                const rankB = idxB === -1 ? 999 : idxB;
                return rankA - rankB;
            });

            // Iterate through ALL books to fill gaps for Retail line.
            for (const book of sortedBooks) {
                if (!book.markets) continue;

                book.markets.forEach((m: any) => {
                    // Moneyline (H2H)
                    if (m.key === 'h2h' && (homeML === null || awayML === null)) {
                        // Fuzzy match outcomes
                        const normHome = normalizeForMatch(String(homeNameRaw));
                        const normAway = normalizeForMatch(String(awayNameRaw));

                        const h = m.outcomes.find((o: any) => normalizeForMatch(o.name).includes(normHome) || normHome.includes(normalizeForMatch(o.name)));
                        const a = m.outcomes.find((o: any) => normalizeForMatch(o.name).includes(normAway) || normAway.includes(normalizeForMatch(o.name)));
                        
                        if (h?.price) homeML = toAmerican(h.price);
                        if (a?.price) awayML = toAmerican(a.price);
                    }

                    // Spread
                    if (m.key === 'spreads' && homeSpread === null) {
                        const normHome = normalizeForMatch(String(homeNameRaw));
                        const h = m.outcomes.find((o: any) => normalizeForMatch(o.name).includes(normHome) || normHome.includes(normalizeForMatch(o.name)));
                        if (h?.point !== undefined) homeSpread = h.point;
                    }

                    // Totals
                    if (m.key === 'totals' && total === null) {
                        const o = m.outcomes.find((o: any) => o.name === 'Over');
                        if (o?.point !== undefined) total = o.point;
                    }
                });

                if (homeML !== null && awayML !== null && homeSpread !== null && total !== null) break;
            }

            // 2. SHARP EXTRACTION (Pinnacle Explicitly)
            const pinBook = g.bookmakers.find((b: any) => b.key === 'pinnacle');
            if (pinBook && pinBook.markets) {
                pinBook.markets.forEach((m: any) => {
                     if (m.key === 'spreads') {
                        const normHome = normalizeForMatch(String(homeNameRaw));
                        const h = m.outcomes.find((o: any) => normalizeForMatch(o.name).includes(normHome) || normHome.includes(normalizeForMatch(o.name)));
                        if (h?.point !== undefined) pinSpread = h.point;
                     }
                     if (m.key === 'totals') {
                        const o = m.outcomes.find((o: any) => o.name === 'Over');
                        if (o?.point !== undefined) pinTotal = o.point;
                     }
                     if (m.key === 'h2h') {
                        const normHome = normalizeForMatch(String(homeNameRaw));
                        const normAway = normalizeForMatch(String(awayNameRaw));
                        const h = m.outcomes.find((o: any) => normalizeForMatch(o.name).includes(normHome) || normHome.includes(normalizeForMatch(o.name)));
                        const a = m.outcomes.find((o: any) => normalizeForMatch(o.name).includes(normAway) || normAway.includes(normalizeForMatch(o.name)));
                        if (h?.price) pinHomeML = toAmerican(h.price);
                        if (a?.price) pinAwayML = toAmerican(a.price);
                     }
                });
            }
        }

        // STRATEGY B: FLAT FILE FALLBACK
        // If nested extraction failed or wasn't present, check flat keys.
        // We use 'parseProbableOdds' to handle Decimal input automatically.
        if (homeSpread === null) {
            const val = this.getValue(g, ['spread', 'Spread', 'Handicap', 'line', 'Line', 'home_spread', 'HomeSpread']);
            if (val !== undefined) homeSpread = Number(val);
        }
        
        if (total === null) {
            const val = this.getValue(g, ['total', 'Total', 'OverUnder', 'over_under', 'ou', 'total_line']);
            if (val !== undefined) total = Number(val);
        }

        if (homeML === null) {
            const val = this.getValue(g, [
                'homePrice', 'home_price', // Added
                'home_ml', 'home_moneyline', 'HomeMoneyLine', 'h2h_home', 'moneyline_home', 'HomeOdds', 'MoneyLineHome'
            ]);
            homeML = parseProbableOdds(val);
        }

        if (awayML === null) {
            const val = this.getValue(g, [
                'awayPrice', 'away_price', // Added
                'away_ml', 'away_moneyline', 'AwayMoneyLine', 'h2h_away', 'moneyline_away', 'AwayOdds', 'MoneyLineAway'
            ]);
            awayML = parseProbableOdds(val);
        }

        // Strategy B: Sharp Fallbacks
        if (pinSpread === null) {
             const val = this.getValue(g, [
                 'pinSpread', 'pin_spread', 
                 'pinnacle_spread', 'sharp_spread'
             ]);
             if (val !== undefined) pinSpread = Number(val);
        }
        if (pinTotal === null) {
             const val = this.getValue(g, [
                 'pinTotal', 'pin_total', 
                 'pinnacle_total', 'sharp_total'
             ]);
             if (val !== undefined) pinTotal = Number(val);
        }
        if (pinHomeML === null) {
             const val = this.getValue(g, [
                 'pinHomeML', 'pin_ml_home', 'pin_home_ml'
             ]);
             if (val !== undefined) pinHomeML = parseProbableOdds(val);
        }

        // FINALIZING
        const market: MarketOdds = {
            spread_line: homeSpread !== null ? homeSpread : 0, 
            spread_odds: -110,
            total_line: total !== null ? total : 0,
            total_odds: -110,
            home_ml: homeML !== null ? homeML : 0,
            away_ml: awayML !== null ? awayML : 0,
            
            // Sharp Data
            pinSpread: pinSpread !== null ? pinSpread : undefined,
            pinTotal: pinTotal !== null ? pinTotal : undefined,
            pinHomeML: pinHomeML !== null ? pinHomeML : undefined,
            pinAwayML: pinAwayML !== null ? pinAwayML : undefined
        };
        
        this.oddsCache.set(gameId, market);
    }

    console.table(diagnostics); 
    console.log(`[HybridDataProvider] Result: ${schedule.length} games accepted out of ${this.rawOddsData.length} raw items.`);
    console.groupEnd();

    this.scheduleCache = schedule;
    return schedule;
  }

  public async getOdds(date: Date): Promise<Map<string, MarketOdds>> {
    if (!this.oddsCache) {
      await this.getSchedule(date);
    }
    return this.oddsCache || new Map();
  }

  public async getAllPlayerStats(season: string): Promise<RawPlayerSeasonData[]> {
    return this.playerStats;
  }

  public async getInjuryReport(): Promise<InjuryStatus[]> {
    return [];
  }

  private fuzzyMatchTeam(name: string): string {
    if (!name) return 'UNK';
    const clean = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
    const map: Record<string, string> = {
        'atlantahawks': 'ATL', 'hawks': 'ATL', 'atl': 'ATL', 'atlanta': 'ATL',
        'bostonceltics': 'BOS', 'celtics': 'BOS', 'bos': 'BOS', 'boston': 'BOS',
        'brooklynnets': 'BKN', 'nets': 'BKN', 'bkn': 'BKN', 'brooklyn': 'BKN',
        'charlottehornets': 'CHA', 'hornets': 'CHA', 'cha': 'CHA', 'charlotte': 'CHA',
        'chicagobulls': 'CHI', 'bulls': 'CHI', 'chi': 'CHI', 'chicago': 'CHI',
        'clevelandcavaliers': 'CLE', 'cavaliers': 'CLE', 'cavs': 'CLE', 'cle': 'CLE', 'cleveland': 'CLE',
        'dallasmavericks': 'DAL', 'mavericks': 'DAL', 'mavs': 'DAL', 'dal': 'DAL', 'dallas': 'DAL',
        'denvernuggets': 'DEN', 'nuggets': 'DEN', 'den': 'DEN', 'denver': 'DEN',
        'detroitpistons': 'DET', 'pistons': 'DET', 'det': 'DET', 'detroit': 'DET',
        'goldenstatewarriors': 'GSW', 'warriors': 'GSW', 'gsw': 'GSW', 'goldenstate': 'GSW',
        'houstonrockets': 'HOU', 'rockets': 'HOU', 'hou': 'HOU', 'houston': 'HOU',
        'indianapacers': 'IND', 'pacers': 'IND', 'ind': 'IND', 'indiana': 'IND',
        'losangelesclippers': 'LAC', 'laclippers': 'LAC', 'clippers': 'LAC', 'lac': 'LAC',
        'losangeleslakers': 'LAL', 'lalakers': 'LAL', 'lakers': 'LAL', 'lal': 'LAL',
        'memphisgrizzlies': 'MEM', 'grizzlies': 'MEM', 'mem': 'MEM', 'memphis': 'MEM',
        'miamiheat': 'MIA', 'heat': 'MIA', 'mia': 'MIA', 'miami': 'MIA',
        'milwaukeebucks': 'MIL', 'bucks': 'MIL', 'mil': 'MIL', 'milwaukee': 'MIL',
        'minnesotatimberwolves': 'MIN', 'timberwolves': 'MIN', 'wolves': 'MIN', 'min': 'MIN', 'minnesota': 'MIN',
        'neworleanspelicans': 'NOP', 'pelicans': 'NOP', 'nop': 'NOP', 'neworleans': 'NOP',
        'newyorkknicks': 'NYK', 'knicks': 'NYK', 'nyk': 'NYK', 'nyknicks': 'NYK', 'newyork': 'NYK',
        'oklahomacitythunder': 'OKC', 'thunder': 'OKC', 'okc': 'OKC', 'oklahoma': 'OKC', 'oklahomacity': 'OKC',
        'orlandomagic': 'ORL', 'magic': 'ORL', 'orl': 'ORL', 'orlando': 'ORL',
        'philadelphia76ers': 'PHI', '76ers': 'PHI', 'sixers': 'PHI', 'phi': 'PHI', 'philadelphia': 'PHI', 'philly': 'PHI',
        'phoenixsuns': 'PHX', 'suns': 'PHX', 'phx': 'PHX', 'phoenix': 'PHX',
        'portlandtrailblazers': 'POR', 'trailblazers': 'POR', 'blazers': 'POR', 'por': 'POR', 'portland': 'POR',
        'sacramentokings': 'SAC', 'kings': 'SAC', 'sac': 'SAC', 'sacramento': 'SAC',
        'sanantoniospurs': 'SAS', 'spurs': 'SAS', 'sas': 'SAS', 'sanantonio': 'SAS',
        'torontoraptors': 'TOR', 'raptors': 'TOR', 'tor': 'TOR', 'toronto': 'TOR',
        'utahjazz': 'UTA', 'jazz': 'UTA', 'uta': 'UTA', 'utah': 'UTA',
        'washingtonwizards': 'WAS', 'wizards': 'WAS', 'was': 'WAS', 'washington': 'WAS'
    };

    if (clean === 'la' || clean === 'losangeles') return 'LAL';
    if (clean === 'ny' || clean === 'newyork') return 'NYK';

    return map[clean] || 'UNK';
  }
}
