
import React from 'react';
import { TrackedBet } from '../types/BetTypes';

// @deprecated Use BetTracker.tsx instead
interface BetSlipProps {
  bets: TrackedBet[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export const BetSlip: React.FC<BetSlipProps> = ({ bets, onRemove, onClear }) => {
  return null; // Component replaced by BetTracker
};
