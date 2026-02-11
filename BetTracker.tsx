
import React, { useState } from 'react';
import { TrackedBet, BetResult } from '../types/BetTypes';

interface BetTrackerProps {
  bets: TrackedBet[];
  onRemove: (id: string) => void;
  onUpdateResult: (id: string, result: BetResult) => void;
}

export const BetTracker: React.FC<BetTrackerProps> = ({ bets, onRemove, onUpdateResult }) => {
  const [copied, setCopied] = useState(false);

  // Sort: Pending first, then by timestamp (newest first)
  const sortedBets = [...bets].sort((a, b) => {
    if (a.result === 'Pending' && b.result !== 'Pending') return -1;
    if (a.result !== 'Pending' && b.result === 'Pending') return 1;
    return b.timestamp - a.timestamp;
  });

  const getCategoryColor = (cat: string) => {
    if (cat === 'Spread') return 'text-emerald-400';
    if (cat === 'Over' || cat === 'Under') return 'text-blue-400';
    return 'text-amber-400'; // Moneyline
  };

  const handleCopyPending = () => {
    const pending = bets.filter(b => b.result === 'Pending');
    if (pending.length === 0) return;

    const lines = pending.map(b => {
        const oddsStr = b.odds > 0 ? `+${b.odds}` : `${b.odds}`;
        return `${b.pick} (${oddsStr}) [${b.units.toFixed(2)}u]`;
    });

    const header = `APEX ACTIONS // ${new Date().toLocaleDateString()}`;
    const text = `${header}\n------------------------\n${lines.join('\n')}`;

    navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
  };

  return (
    <div className="w-full bg-black">
        {/* Header Bar */}
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-4">
                <h3 className="text-white font-bold tracking-tighter flex items-center gap-2">
                   <span className="text-blue-500">●</span> LIVE TICKET LEDGER
                </h3>
                {bets.some(b => b.result === 'Pending') && (
                    <button 
                        onClick={handleCopyPending}
                        className={`
                            text-[10px] px-3 py-1 rounded border transition-all font-bold uppercase tracking-wider
                            ${copied 
                                ? 'bg-green-900/30 text-green-400 border-green-800' 
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-slate-500'}
                        `}
                    >
                        {copied ? '✓ COPIED' : 'COPY SLIP'}
                    </button>
                )}
            </div>
            <div className="text-xs text-slate-500 font-mono">
                {bets.length} TOTAL PLAYS
            </div>
        </div>

        {/* List Container */}
        <div className="p-4 space-y-2">
            {sortedBets.length === 0 ? (
            <div className="text-center mt-10 opacity-30 select-none py-20 border border-dashed border-slate-800 rounded bg-slate-950">
                <div className="text-5xl grayscale mb-4">🎟️</div>
                <div className="text-sm font-mono text-slate-500">NO ACTIVE PLAYS IN PORTFOLIO</div>
            </div>
            ) : (
            sortedBets.map((bet) => (
                <div 
                key={bet.id} 
                className={`
                    flex flex-col md:flex-row md:items-center justify-between p-4 rounded border transition-all group gap-4
                    ${bet.result === 'Pending' ? 'bg-slate-900/40 border-slate-700 hover:border-slate-500' : ''}
                    ${bet.result === 'Win' ? 'bg-green-950/10 border-green-900/30 opacity-75' : ''}
                    ${bet.result === 'Loss' ? 'bg-red-950/10 border-red-900/30 opacity-60' : ''}
                    ${bet.result === 'Push' ? 'bg-yellow-950/10 border-yellow-900/30 opacity-60' : ''}
                `}
                >
                {/* Left: Game & Time */}
                <div className="flex-1 min-w-[150px]">
                    <div className="flex items-center gap-2 mb-1">
                         <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            {bet.game}
                        </span>
                        <span className="text-[10px] text-slate-600 font-mono bg-slate-900 px-1.5 rounded flex items-center gap-1">
                            <span>{new Date(bet.timestamp).toLocaleDateString(undefined, {month: 'numeric', day: 'numeric'})}</span>
                            <span className="text-slate-700">•</span>
                            <span>{new Date(bet.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </span>
                    </div>
                </div>
                
                {/* Middle: The Pick */}
                <div className="flex-2 min-w-[200px]">
                    <div className={`text-base font-bold ${bet.result === 'Pending' ? 'text-white' : 'text-slate-400'} tracking-wide flex items-center gap-3`}>
                        {bet.pick}
                        <span className="text-xs font-normal text-slate-500 font-mono">
                            ({bet.odds > 0 ? `+${bet.odds}` : bet.odds})
                        </span>

                        {/* CLV INDICATOR */}
                        {(bet.clv !== undefined) && (
                            <span className={`text-[10px] font-mono px-1.5 rounded border ${bet.clv > 0 ? 'text-green-400 border-green-900 bg-green-900/20' : bet.clv < 0 ? 'text-red-400 border-red-900 bg-red-900/20' : 'text-slate-500 border-slate-800'}`}>
                                {bet.clv > 0 ? '▲' : bet.clv < 0 ? '▼' : '•'} CLV {bet.clv > 0 ? '+' : ''}{bet.clv}
                            </span>
                        )}
                    </div>
                    <div className="text-[10px] flex gap-2 mt-0.5 items-center">
                        <span className={`font-bold ${getCategoryColor(bet.category)}`}>{bet.category}</span>
                        <span className="text-slate-600">|</span>
                        <span className="text-slate-400">{(bet.edge * 100).toFixed(1)}% Edge</span>
                        
                        {/* FINAL SCORE BADGE */}
                        {(bet.actualHomeScore !== undefined && bet.actualAwayScore !== undefined) && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono font-bold">
                                FINAL: {bet.actualAwayScore} - {bet.actualHomeScore}
                            </span>
                        )}
                    </div>
                </div>

                {/* Right: Stake */}
                <div className="flex-1 text-right min-w-[100px]">
                     <div className="text-white font-bold text-lg font-mono">{bet.units.toFixed(2)}u</div>
                     <div className="text-[10px] text-slate-500">STAKE</div>
                </div>
                
                {/* Far Right: Actions */}
                <div className="flex items-center justify-end gap-2 min-w-[140px] border-l border-slate-800 pl-4 ml-2">
                    {bet.result === 'Pending' ? (
                        <>
                            <button 
                                onClick={() => onUpdateResult(bet.id, 'Win')} 
                                className="h-8 w-8 flex items-center justify-center bg-green-900/10 text-green-600 border border-green-900/30 hover:bg-green-500 hover:text-black hover:border-green-500 rounded uppercase font-bold transition-all text-xs"
                                title="Grade Win"
                            >W</button>
                            <button 
                                onClick={() => onUpdateResult(bet.id, 'Loss')} 
                                className="h-8 w-8 flex items-center justify-center bg-red-900/10 text-red-600 border border-red-900/30 hover:bg-red-500 hover:text-black hover:border-red-500 rounded uppercase font-bold transition-all text-xs"
                                title="Grade Loss"
                            >L</button>
                            <button 
                                onClick={() => onUpdateResult(bet.id, 'Push')} 
                                className="h-8 w-8 flex items-center justify-center bg-yellow-900/10 text-yellow-600 border border-yellow-900/30 hover:bg-yellow-500 hover:text-black hover:border-yellow-500 rounded uppercase font-bold transition-all text-xs"
                                title="Grade Push"
                            >P</button>
                            <button 
                                onClick={() => onRemove(bet.id)}
                                className="h-8 w-8 flex items-center justify-center text-slate-600 hover:text-red-500 hover:bg-red-900/10 rounded transition-all ml-2"
                                title="Delete Ticket"
                            >✖</button>
                        </>
                    ) : (
                        <div className="flex items-center gap-3">
                            <span className={`
                                text-xs font-bold px-3 py-1 rounded border tracking-wider
                                ${bet.result === 'Win' ? 'text-green-400 border-green-900 bg-green-900/20' : ''}
                                ${bet.result === 'Loss' ? 'text-red-400 border-red-900 bg-red-900/20' : ''}
                                ${bet.result === 'Push' ? 'text-yellow-400 border-yellow-900 bg-yellow-900/20' : ''}
                            `}>
                                {bet.result.toUpperCase()}
                            </span>
                            <button 
                                onClick={() => onUpdateResult(bet.id, 'Pending')}
                                className="text-[10px] text-slate-600 hover:text-slate-400 underline decoration-slate-700"
                            >
                                undo
                            </button>
                        </div>
                    )}
                </div>
                </div>
            ))
            )}
        </div>
    </div>
  );
};
