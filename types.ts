
export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export type PlayerStatus = 'ACTIVE' | 'OUT' | 'GTD' | 'DOUBTFUL';

// New Type for Data Integrity Tracking
export type StatSource = 'OFFICIAL' | 'CALCULATED' | 'DEFAULT';

export interface RawGameLog {
  points: number;
  fga: number;
  fgm: number;
  fta: number;
  ftm: number;
  tov: number;
  orb: number;
  drb: number;
  stl: number;
  blk: number;
  minutes: number;
  
  // Context for normalization
  team_pace: number;
  team_mp: number; // Usually 240
  team_fga: number;
  team_fta: number;
  team_tov: number;
}

// The normalized profile used for the Aggregator
export interface PlayerEfficiencyProfile {
  // Efficiency Metrics (Per 100 Possessions)
  efg_pct: number;      
  usg_pct: number;      
  orb_pct: number;      
  drb_pct: number;      
  tov_pct: number;      
  ftr: number;
  three_par: number;    // Added V3.0: 3-Point Attempt Rate
  
  // Production Metrics (Per 100)
  pts_per_100: number;
  ast_per_100: number;
  stl_per_100: number;
  blk_per_100: number;
  
  // Advanced Ratings (The inputs for the Team Model)
  ortg: number;         // Offensive Rating
  drtg: number;         // Defensive Rating
  pace_impact: number;  // The pace the team plays at when this player is on court
  bpm: number;          // Box Plus/Minus

  // Data Provenance
  sourceType?: StatSource;
}

// For Phase 1 compatibility, we alias Stats to the Profile
export type PlayerStats = PlayerEfficiencyProfile;

export interface Player {
  id: string;
  name: string;
  position: Position;
  status: PlayerStatus;
  depth_order: number;  // 1 = Starter, 2 = Rotation, 3 = Deep Bench
  season_minutes_avg: number;
  stats: PlayerStats;
}

export interface RotationEntry {
  playerId: string;
  projected_minutes: number;
  usage_share: number; // The % of team possessions this player will use in their minutes
}

export interface Rotation {
  entries: RotationEntry[];
  total_minutes: number; // Must equal 240
}

export interface ProjectedTeamPerformance {
  projectedORtg: number;
  projectedDRtg: number;
  projectedPace: number;
  projectedThreeRate: number; // Added V3.0: Team weighted 3PAr
  netRating: number;
  compositeFourFactors: {
    eFG: number;
    tov: number;
    orb: number;
    drb: number; // Added V2.6
    ftr: number;
  };
}

export interface TeamModel {
  team_id: string;
  rotation: Rotation;
  projection: ProjectedTeamPerformance;
}

export interface Market {
  provider: string;
  opening_spread: number;
  current_spread: number;
  moneyline_home: number;
  moneyline_away: number;
  hold: number;
  timestamp: string;
}

// --- PHASE 3 ADDITIONS ---

export interface SimulationDebug {
    rawHomeORtg: number;
    hcaHomeORtg: number; // New intermediate step
    regressedHomeORtg: number;
    
    rawAwayORtg: number;
    hcaAwayORtg: number; // New intermediate step
    regressedAwayORtg: number;
    
    rawPace: number;
    regressedPace: number;

    // Totals Compression Metrics
    projectedRawTotal: number;
    projectedCompressedTotal: number;

    // Pace-Efficiency Friction
    paceFriction: number;

    // V2.9: Four Factors Breakdown
    factors?: {
        home: { efg: number; tov: number; orb: number; ftr: number };
        away: { efg: number; tov: number; orb: number; ftr: number };
        pace: number;
    };
}

export interface SimulationResult {
  homeWinPct: number;
  projectedSpread: number; // Average (Away Score - Home Score)
  projectedTotal: number;  // Average (Home Score + Away Score)
  homeScoreAvg: number;
  awayScoreAvg: number;
  scatterData: { home: number; away: number }[]; // Sample for plotting
  debug: SimulationDebug; // Exposed physics for UI validation
}

export interface MarketOdds {
  spread_line: number; // e.g. -4.5 (Home Favored)
  spread_odds: number; // -110
  total_line: number;  // 215.5
  total_odds: number;  // -110
  home_ml: number;     // -180
  away_ml: number;     // +155

  // Sharp Data (Pinnacle) - V4.0
  pinSpread?: number;
  pinTotal?: number;
  pinHomeML?: number;
  pinAwayML?: number;
}

export type BetType = 'SPREAD' | 'TOTAL' | 'MONEYLINE';
export type BetGrade = 'STANDARD' | 'LEAN' | 'OUTLIER' | 'PASS';

export interface BetTicket {
  betType: BetType;
  description: string; // e.g., "NYK -4.5"
  marketPrice: number; // American odds
  impliedProb: number;
  modelProb: number;
  edgePercentage: number; // ROI
  kellyUnits: number;
  grade: BetGrade;
  isCapped?: boolean; // Flag if risk management capped the size
}
