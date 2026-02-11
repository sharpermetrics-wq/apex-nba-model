
import React from 'react';
import { Player } from '../types';
import { ParsedInjuryStatus } from '../services/InjuryParser';

interface RosterModalProps {
  teamName: string;
  players: Player[];
  inactiveIds: string[];
  injuryMap: Record<string, ParsedInjuryStatus>;
  onToggle: (playerId: string) => void;
  onClose: () => void;
}

export const RosterModal: React.FC<RosterModalProps> = ({ 
  teamName, 
  players, 
  inactiveIds, 
  injuryMap,
  onToggle, 
  onClose 
}) => {
  // Sort by Minutes (Importance)
  const sortedPlayers = [...players].sort((a, b) => b.season_minutes_avg - a.season_minutes_avg);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-black">
          <h3 className="font-bold text-white tracking-wider font-mono">
            {teamName} <span className="text-slate-500">ROSTER</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {/* List */}
        <div className="overflow-y-auto p-2 space-y-1 flex-grow custom-scrollbar">
          {sortedPlayers.map(p => {
             const isInactive = inactiveIds.includes(p.id);
             const status = injuryMap[p.id]; 

             return (
               <div 
                 key={p.id}
                 onClick={() => onToggle(p.id)}
                 className={`
                    flex items-center justify-between p-3 rounded cursor-pointer border select-none transition-all
                    ${isInactive 
                        ? 'bg-red-950/20 border-red-900/30 opacity-60 grayscale' 
                        : 'bg-slate-800/40 border-slate-700 hover:bg-slate-800 hover:border-slate-500'}
                 `}
               >
                 <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${isInactive ? 'text-red-400 line-through' : 'text-slate-200'}`}>
                            {p.name}
                        </span>
                        
                        {/* INJURY BADGES */}
                        {(status === 'OUT') && (
                            <span className="text-[9px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded shadow-sm">O</span>
                        )}
                        {status === 'DOUBTFUL' && (
                            <span className="text-[9px] font-bold bg-orange-600 text-white px-1.5 py-0.5 rounded shadow-sm">D</span>
                        )}
                        {status === 'QUESTIONABLE' && (
                            <span className="text-[9px] font-bold bg-amber-500 text-black px-1.5 py-0.5 rounded shadow-sm">Q</span>
                        )}
                        {status === 'PROBABLE' && (
                            <span className="text-[9px] font-bold bg-yellow-500 text-black px-1.5 py-0.5 rounded shadow-sm">P</span>
                        )}
                    </div>
                    
                    <span className="text-[10px] text-slate-500 font-mono">
                        {p.position} • {p.season_minutes_avg.toFixed(1)} MPG • {p.stats.usg_pct.toFixed(1)}% USG
                    </span>
                 </div>
                 
                 <div className={`
                    w-5 h-5 rounded border flex items-center justify-center transition-colors
                    ${isInactive ? 'border-red-500 bg-red-900/50' : 'border-green-500 bg-green-500'}
                 `}>
                    {!isInactive && <span className="text-black font-bold text-xs">✓</span>}
                 </div>
               </div>
             );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-black border-t border-slate-800 flex flex-col gap-3">
            <div className="text-[10px] text-slate-500 text-center">
                ADJUSTMENTS RECALCULATE PROJECTIONS INSTANTLY.
            </div>
            <button 
                onClick={onClose}
                className="w-full bg-green-600 hover:bg-green-500 text-black font-bold py-3 rounded text-xs tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(22,163,74,0.3)] hover:shadow-[0_0_20px_rgba(22,163,74,0.5)]"
            >
                UPDATE MODEL
            </button>
        </div>
      </div>
    </div>
  );
};
