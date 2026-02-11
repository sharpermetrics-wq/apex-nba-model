

import React from 'react';
import { BetGrade } from '../types';

interface ValueBadgeProps {
  grade: BetGrade;
  edge: number;
  units: number;
}

export const ValueBadge: React.FC<ValueBadgeProps> = ({ grade, edge, units }) => {
  const edgePct = (edge * 100).toFixed(1);

  if (grade === 'STANDARD') {
    return (
      <div className="flex items-center space-x-2 font-mono">
        <span className="bg-emerald-500 text-black px-2 py-1 text-xs font-bold rounded shadow-[0_0_10px_rgba(16,185,129,0.5)]">
          STANDARD
        </span>
        <span className="text-emerald-400 text-xs">+{edgePct}% / {units.toFixed(1)}u</span>
      </div>
    );
  }

  if (grade === 'LEAN') {
    return (
      <div className="flex items-center space-x-2 font-mono">
        <span className="border border-yellow-500 text-yellow-500 px-2 py-1 text-xs font-bold rounded">
          LEAN
        </span>
        <span className="text-yellow-500 text-xs">+{edgePct}% / {units.toFixed(1)}u</span>
      </div>
    );
  }

  if (grade === 'OUTLIER') {
    return (
      <div className="flex items-center space-x-2 font-mono">
        <span className="border border-purple-500 text-purple-500 px-2 py-1 text-xs font-bold rounded bg-purple-900/20">
          ⚠️ SUSPICIOUS
        </span>
        <span className="text-purple-400 text-xs">+{edgePct}% / REVIEW</span>
      </div>
    );
  }

  return (
    <span className="text-red-900 bg-red-900/20 px-2 py-1 text-xs font-bold rounded font-mono">
      NO VALUE
    </span>
  );
};
