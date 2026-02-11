
import { BetGrade } from './index';

export type BetResult = 'Pending' | 'Win' | 'Loss' | 'Push';
export type BetCategory = 'Spread' | 'Over' | 'Under' | 'Moneyline';

export interface BetSnapshot {
  projectedPace: number;
  projectedHomeORtg: number;
  projectedAwayORtg: number;
  marketSpread: number;
  marketTotal: number;
  closingLine?: number; 
  isStarOut: boolean;
  isFatigueActive: boolean;
}

export interface TrackedBet {
  id: string;        // Unique ID (e.g., gameId + type + timestamp)
  game: string;      // "BOS vs MIA"
  pick: string;      // "BOS -4.5" or "Over 210.5"
  category: BetCategory; 
  odds: number;      // 1.91 (Decimal) or -110 (American)
  edge: number;      // 0.045 (4.5%)
  units: number;     // 1.2
  grade: BetGrade;   // Persist the quality grade (STANDARD, LEAN, OUTLIER)
  result: BetResult;
  timestamp: number;
  dateStr: string;   // ISO Date string for grouping/sorting
  snapshot: BetSnapshot; // V3.1: Black Box Recorder
  
  // V3.2: Result Ingestion
  actualHomeScore?: number;
  actualAwayScore?: number;

  // V3.3: Closing Line Value (CLV) Audit
  closingLine?: number; 
  clv?: number;         // Positive = Value Gained, Negative = Value Lost
}
