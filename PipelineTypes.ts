
import { 
  SimulationResult, 
  BetTicket, 
  ProjectedTeamPerformance, 
  MarketOdds, 
  Position, 
  PlayerEfficiencyProfile,
  Player
} from '../types';

export interface GameSchedule {
  gameId: string;
  date: string; // ISO String
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
}

export interface InjuryStatus {
  playerId: string;
  status: 'ACTIVE' | 'OUT' | 'GTD' | 'DOUBTFUL';
  details: string;
}

// The raw data block we get from our provider for a player season.
// We assume the provider (or an adapter) gives us the pre-calculated efficiency profile components.
export interface RawPlayerSeasonData {
  id: string;
  name: string;
  teamId: string;
  position: Position;
  minutesPerGame: number;
  gamesPlayed: number;
  efficiencyProfile: PlayerEfficiencyProfile; 
}

export interface TeamFatigueState {
  isB2B: boolean;
  is3in4: boolean;
  isRoad: boolean;
}

// The "Card" object that contains everything needed to render a game analysis.
export interface AnalyzedGame {
  gameId: string;
  matchup: string; // e.g. "NYK @ BOS"
  startTime: string;
  
  // Roster Data for Client-Side Adjustment
  homeRoster: Player[];
  awayRoster: Player[];

  // Context: Fatigue
  homeFatigue: TeamFatigueState;
  awayFatigue: TeamFatigueState;

  // The Data (Model Output)
  homeProjection: ProjectedTeamPerformance;
  awayProjection: ProjectedTeamPerformance;
  simulation: SimulationResult;
  
  // The Action (Financials)
  market: MarketOdds;
  valueBets: BetTicket[];
  
  // Context
  keyInjuries: InjuryStatus[];
}
