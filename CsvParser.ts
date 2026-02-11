
import { RawPlayerSeasonData } from '../types/PipelineTypes';
import { PlayerEfficiencyProfile, Position, StatSource } from '../types';

export class CsvParser {
  
  /**
   * Parses raw CSV text from Basketball-Reference "Per 100 Possessions" export.
   * Handles quoted strings, BOM markers, flexible header casing, and missing columns safely.
   */
  public static parse(csvText: string): RawPlayerSeasonData[] {
    // 1. Clean Pre-processing: Remove BOM
    const cleanText = csvText.replace(/^\ufeff/, '');
    
    // Split by any common line ending (\n, \r\n, \r)
    const lines = cleanText.split(/\r\n|\n|\r/);
    
    const players: RawPlayerSeasonData[] = [];

    // Helper to clean CSV values (remove quotes, trim whitespace)
    const cleanVal = (val: string | undefined) => {
        if (!val) return '';
        return val.trim().replace(/^"|"$/g, ''); // Remove surrounding quotes
    };

    // 2. Find the Header Row
    let headerIndex = -1;
    let headers: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const rowRaw = lines[i].split(',');
      const rowClean = rowRaw.map(cleanVal);
      
      // Look for key columns case-insensitive
      const hasPlayer = rowClean.some(c => c.toLowerCase().includes('player'));
      const hasTeam = rowClean.some(c => ['tm', 'team', 'squad'].includes(c.toLowerCase()));
      
      if (hasPlayer && hasTeam) {
        headerIndex = i;
        headers = rowClean;
        break;
      }
    }

    if (headerIndex === -1) {
      console.error("[CsvParser] Error: Could not find header row containing 'Player' and 'Tm'/'Team'");
      return [];
    }

    // Map column names to indices (Case Insensitive & Aliases)
    const findCol = (aliases: string[]) => {
        const lowerAliases = aliases.map(a => a.toLowerCase());
        return headers.findIndex(h => lowerAliases.includes(h.toLowerCase()));
    };
    
    const idxName = findCol(['Player', 'Player Name', 'Name']);
    const idxTeam = findCol(['Tm', 'Team', 'Squad']); // Handle "Tm" or "Team"
    const idxPos = findCol(['Pos', 'Position']);
    const idxG = findCol(['G', 'GP', 'Games']);
    const idxMP = findCol(['MP', 'Min', 'Minutes']);
    
    // Critical Check: If Name or Team column is missing, we can't map players.
    if (idxName === -1 || idxTeam === -1) {
        console.error("[CsvParser] Critical columns (Player or Team) missing despite header detection.");
        return [];
    }
    
    // Stats (Per 100)
    const idxPTS = findCol(['PTS', 'Points']);
    const idxORtg = findCol(['ORtg', 'Off Rtg']);
    const idxDRtg = findCol(['DRtg', 'Def Rtg', 'DefRtg']);
    const idxFGA = findCol(['FGA']);
    const idxFTA = findCol(['FTA']);
    const idxTOV = findCol(['TOV', 'Turnovers']);
    const idxORB = findCol(['ORB', 'OReb']);
    const idxDRB = findCol(['DRB', 'DReb']); 
    const idxAST = findCol(['AST', 'Assists']);
    const idxSTL = findCol(['STL', 'Steals']);
    const idxBLK = findCol(['BLK', 'Blocks']);

    // FOUR FACTORS (Percentages) - V2.6 Upgrade
    const idxORBPct = findCol(['ORB%', 'ORB Pct']);
    const idxDRBPct = findCol(['DRB%', 'DRB Pct']);
    const idxTOVPct = findCol(['TOV%', 'TOV Pct']);
    const idxFTr = findCol(['FTr', 'FTrate']);

    // DYNAMIC VARIANCE (3PAr) - V3.0 Upgrade
    const idx3PAr = findCol(['3PAr', '3P Rate']);
    const idx3PA = findCol(['3PA', '3P Attempts']);

    // 3. Iterate Rows
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const rowRaw = lines[i].split(',');
      
      // Basic integrity check
      if (rowRaw.length < 5) continue;

      const row = rowRaw.map(cleanVal);

      // Access Columns Safely
      const name = row[idxName];
      // If header repeated or empty line
      if (!name || name.toLowerCase() === 'player' || name.toLowerCase() === 'rk') continue;

      const teamRaw = row[idxTeam];
      
      // Normalize Team ID
      const teamId = this.normalizeTeamId(teamRaw);
      if (teamId === 'UNK') continue; 

      const gp = parseFloat(row[idxG]) || 0;
      const totalMin = parseFloat(row[idxMP]) || 0;
      
      // Filter noise (Low minutes)
      if (totalMin < 5) continue; 

      const mpg = gp > 0 ? totalMin / gp : 0;
      
      // Parse Stats (Helper to safely parse float from index)
      const getStat = (idx: number) => (idx !== -1 && row[idx]) ? parseFloat(row[idx]) : 0;

      const pts = getStat(idxPTS);
      const fga = getStat(idxFGA);
      const fta = getStat(idxFTA);
      const tov = getStat(idxTOV);
      const orb = getStat(idxORB);
      const drb = getStat(idxDRB);
      const stl = getStat(idxSTL);
      const blk = getStat(idxBLK);

      // Four Factors Parsing
      const orbPctRaw = getStat(idxORBPct);
      const drbPctRaw = getStat(idxDRBPct);
      const tovPctRaw = getStat(idxTOVPct);
      const ftrRaw = getStat(idxFTr);

      // 3PAr Parsing (Explicit or Calculated)
      let threePar = getStat(idx3PAr);
      if (threePar === 0 && fga > 0) {
          const threePA = getStat(idx3PA);
          threePar = threePA / fga;
      }
      
      // Usage Proxy
      const playsUsed = fga + (0.44 * fta) + tov;
      const usg_pct = playsUsed; 

      // --- RATING & INTEGRITY LOGIC ---
      // Determine if we are using OFFICIAL data (columns exist) or CALCULATED/DEFAULT
      let sourceType: StatSource = 'OFFICIAL';

      // 1. ORtg Logic
      let ortg = 0;
      // Try Official Column first
      if (idxORtg !== -1) {
          const val = getStat(idxORtg);
          if (val > 0) ortg = val;
      }

      // If missing, try Proxy
      if (ortg === 0) {
          if (pts > 0) {
              ortg = pts * 1.1 + 10;
              // Downgrade to CALCULATED if we haven't already defaulted
              if (sourceType === 'OFFICIAL') sourceType = 'CALCULATED';
          } else {
              ortg = 100; // Safety Constant
              sourceType = 'DEFAULT';
          }
      }

      // 2. DRtg Logic
      let drtg = 0;
      // Try Official Column first
      if (idxDRtg !== -1) {
          const val = getStat(idxDRtg);
          if (val > 0) drtg = val;
      }

      // If missing, try Proxy (Stocks-based)
      if (drtg === 0) {
          const stocksImpact = (stl * 2.0) + (blk * 1.5);
          // If we have any stocks info, we consider this a valid calculation
          if (stocksImpact > 0 || stl > 0 || blk > 0) {
              drtg = 117.0 - stocksImpact;
              // Downgrade to CALCULATED if not already Default
              if (sourceType === 'OFFICIAL') sourceType = 'CALCULATED';
          } else {
              // No stocks, no columns -> Safety Constant
              drtg = 116.5; 
              sourceType = 'DEFAULT';
          }
      }

      // Position Cleanup
      let posRaw = (idxPos !== -1 ? row[idxPos] : 'SG') || 'SG';
      if (posRaw.includes('-')) posRaw = posRaw.split('-')[0];
      const position = ['PG','SG','SF','PF','C'].includes(posRaw) ? posRaw as Position : 'SG';

      // SYNDICATE TUNING V2.2: Corrected eFG% Math
      const ftPointsApprox = fta * 0.78;
      const efgCalc = fga > 0 ? (pts - ftPointsApprox) / (2 * fga) : 0.5;

      const stats: PlayerEfficiencyProfile = {
        pts_per_100: pts,
        ortg: ortg,
        drtg: drtg,
        usg_pct: usg_pct > 0 ? usg_pct : 15,
        efg_pct: efgCalc, 
        // Four Factors Logic
        // Prefer official % columns, fallback to calculated/per-100 proxies
        tov_pct: tovPctRaw > 0 ? tovPctRaw : (playsUsed > 0 ? (tov / playsUsed) * 100 : 10),
        orb_pct: orbPctRaw > 0 ? orbPctRaw : orb,
        drb_pct: drbPctRaw > 0 ? drbPctRaw : drb,
        ftr: ftrRaw > 0 ? ftrRaw : (fga > 0 ? fta / fga : 0.2),
        three_par: threePar, // V3.0 Added

        ast_per_100: getStat(idxAST),
        stl_per_100: stl,
        blk_per_100: blk,
        bpm: 0,
        pace_impact: 100,
        sourceType: sourceType // Tag the profile
      };

      players.push({
        id: `bref-${name.replace(/\W+/g, '').toLowerCase()}-${teamId}`,
        name: name.replace('*', ''), 
        teamId: teamId,
        position: position,
        minutesPerGame: mpg,
        gamesPlayed: gp,
        efficiencyProfile: stats
      });
    }

    return players;
  }

  private static normalizeTeamId(raw: string | undefined): string {
    if (!raw) return 'UNK';
    
    const r = raw.toUpperCase().trim();
    const map: Record<string, string> = {
      'ATL': 'ATL', 'BOS': 'BOS', 'BRK': 'BKN', 'BKN': 'BKN', 'NJN': 'BKN',
      'CHO': 'CHA', 'CHA': 'CHA', 'CHH': 'CHA', 'CHI': 'CHI', 'CLE': 'CLE', 
      'DAL': 'DAL', 'DEN': 'DEN', 'DET': 'DET', 'GSW': 'GSW', 'HOU': 'HOU', 
      'IND': 'IND', 'LAC': 'LAC', 'LAL': 'LAL', 'MEM': 'MEM', 'MIA': 'MIA', 
      'MIL': 'MIL', 'MIN': 'MIN', 'NOP': 'NOP', 'NOH': 'NOP', 'NYK': 'NYK', 
      'OKC': 'OKC', 'ORL': 'ORL', 'PHI': 'PHI', 'PHO': 'PHX', 'PHX': 'PHX', 
      'POR': 'POR', 'SAC': 'SAC', 'SAS': 'SAS', 'TOR': 'TOR', 'UTA': 'UTA', 
      'WAS': 'WAS', 'WSB': 'WAS'
    };
    return map[r] || 'UNK';
  }
}
