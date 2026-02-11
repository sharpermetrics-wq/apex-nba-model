
import React, { useState, useEffect, useMemo } from 'react';
import { AnalyzedGame } from '../types/PipelineTypes';
import { BetTicket, BetGrade, Player } from '../types';
import { BetCategory, BetSnapshot } from '../types/BetTypes';
import { RosterModal } from './RosterModal';
import { TeamAggregator } from '../services/TeamAggregator';
import { MonteCarloEngine } from '../services/MonteCarloEngine';
import { ValuationService } from '../services/ValuationService';

interface GameCardProps {
  game: AnalyzedGame;
  // Updated type to accept new statuses including QUESTIONABLE
  globalInjuryMap: Record<string, 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'PROBABLE' | 'DTD'>;
  onBet: (ticket: BetTicket, matchup: string, snapshot: BetSnapshot, category?: BetCategory) => void;
}

export const GameCard: React.FC<GameCardProps> = ({ game, globalInjuryMap = {}, onBet }) => {
  // Local State for Inactive Players (Removed from calculation)
  const [homeInactive, setHomeInactive] = useState<string[]>([]);
  const [awayInactive, setAwayInactive] = useState<string[]>([]);
  const [showRoster, setShowRoster] = useState<'HOME' | 'AWAY' | null>(null);
  
  // Debug Tooltip State
  const [showDebug, setShowDebug] = useState(false);
  const [addedBets, setAddedBets] = useState<Set<number>>(new Set());

  // Initialize and Sync with Pipeline OR Global Injury Map
  useEffect(() => {
    const hasCustomInjuries = Object.keys(globalInjuryMap).length > 0;

    if (hasCustomInjuries) {
        // SOURCE OF TRUTH: CSV
        const isInactive = (id: string) => {
            const status = globalInjuryMap[id];
            if (!status) return false; 
            if (status === 'PROBABLE') return false; 
            return true; 
        };

        const globalHome = game.homeRoster.filter(p => isInactive(p.id)).map(p => p.id);
        const globalAway = game.awayRoster.filter(p => isInactive(p.id)).map(p => p.id);
        
        setHomeInactive(globalHome);
        setAwayInactive(globalAway);
    } else {
        // Fallback to internal pipeline
        const pipelineHome = game.keyInjuries.filter(i => game.homeRoster.some(p => p.id === i.playerId)).map(i => i.playerId);
        const pipelineAway = game.keyInjuries.filter(i => game.awayRoster.some(p => p.id === i.playerId)).map(i => i.playerId);
        
        setHomeInactive(pipelineHome);
        setAwayInactive(pipelineAway);
    }
  }, [game, globalInjuryMap]); 

  // --- LIVE RECALCULATION ENGINE ---
  const liveData = useMemo(() => {
    const newHomeProj = TeamAggregator.recalculateProjection(game.homeRoster, homeInactive, game.homeFatigue);
    const newAwayProj = TeamAggregator.recalculateProjection(game.awayRoster, awayInactive, game.awayFatigue);
    
    const newSim = MonteCarloEngine.simulate(newHomeProj, newAwayProj, 2000); 
    const newBets = ValuationService.assessValue(newSim, game.market);

    return {
        simulation: newSim,
        valueBets: newBets,
        isAdjusted: homeInactive.length > 0 || awayInactive.length > 0
    };
  }, [game, homeInactive, awayInactive]);

  // --- DATA INTEGRITY CHECK ---
  const dataQuality = useMemo(() => {
    const getTeamIssues = (roster: Player[], inactive: string[]) => {
        // Filter: Active AND Significant (> 5 MPG). 
        // We don't care if the 15th man has bad data.
        const activeSignificant = roster.filter(p => 
            !inactive.includes(p.id) && 
            p.status !== 'OUT' && 
            p.season_minutes_avg > 5.0
        );

        const defaults = activeSignificant.filter(p => p.stats.sourceType === 'DEFAULT').map(p => p.name);
        const proxies = activeSignificant.filter(p => p.stats.sourceType === 'CALCULATED').map(p => p.name);
        
        return { defaults, proxies };
    };

    const homeIssues = getTeamIssues(game.homeRoster, homeInactive);
    const awayIssues = getTeamIssues(game.awayRoster, awayInactive);

    const allDefaults = [...homeIssues.defaults, ...awayIssues.defaults];
    const allProxies = [...homeIssues.proxies, ...awayIssues.proxies];

    if (allDefaults.length > 0) {
        return { status: 'DEFAULT', count: allDefaults.length, culprits: allDefaults };
    }
    if (allProxies.length > 0) {
        return { status: 'CALCULATED', count: allProxies.length, culprits: allProxies };
    }
    return { status: 'OFFICIAL', count: 0, culprits: [] };
  }, [game, homeInactive, awayInactive]);

  const { simulation, valueBets, isAdjusted } = liveData;
  const spreadDiff = simulation.projectedSpread - game.market.spread_line;

  const togglePlayer = (id: string, isHome: boolean) => {
    const list = isHome ? homeInactive : awayInactive;
    const setList = isHome ? setHomeInactive : setAwayInactive;
    
    if (list.includes(id)) {
        setList(list.filter(pid => pid !== id)); 
    } else {
        setList([...list, id]); 
    }
  };

  const resolveCategory = (bet: BetTicket): BetCategory => {
      if (bet.betType === 'SPREAD') return 'Spread';
      if (bet.betType === 'TOTAL') {
          return simulation.projectedTotal > game.market.total_line ? 'Over' : 'Under';
      }
      return 'Moneyline';
  };

  const handleBetClick = (bet: BetTicket, index: number) => {
      // Overwrite units for Outliers. 0 -> 0.5u for risky play.
      const adjustedBet = { ...bet };
      if (bet.grade === 'OUTLIER' && bet.kellyUnits === 0) {
          adjustedBet.kellyUnits = 0.5;
      }

      // --- BLACK BOX RECORDING ---
      // Check for Active Stars Out (USG > 26%)
      const isStarOut = [...game.homeRoster, ...game.awayRoster].some(p => 
        (homeInactive.includes(p.id) || awayInactive.includes(p.id)) && p.stats.usg_pct > 26.0
      );

      const isFatigueActive = 
        game.homeFatigue.isB2B || game.homeFatigue.is3in4 || 
        game.awayFatigue.isB2B || game.awayFatigue.is3in4;

      const snapshot: BetSnapshot = {
          projectedPace: simulation.debug.factors ? simulation.debug.factors.pace : simulation.debug.regressedPace,
          projectedHomeORtg: simulation.debug.regressedHomeORtg,
          projectedAwayORtg: simulation.debug.regressedAwayORtg,
          marketSpread: game.market.spread_line,
          marketTotal: game.market.total_line,
          isStarOut: isStarOut,
          isFatigueActive: isFatigueActive
      };

      onBet(adjustedBet, game.matchup, snapshot, resolveCategory(bet));
      
      setAddedBets(prev => new Set(prev).add(index));
      setTimeout(() => setAddedBets(prev => {
          const next = new Set(prev);
          next.delete(index);
          return next;
      }), 2000);
  };

  const getGradeStyles = (grade: BetGrade) => {
    switch(grade) {
        case 'STANDARD': return 'border-emerald-500 bg-emerald-950/40 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
        case 'LEAN': return 'border-yellow-600 bg-yellow-900/20 text-yellow-500';
        case 'OUTLIER': return 'border-purple-500 bg-purple-900/20 text-purple-400 opacity-80';
        default: return 'border-slate-700 bg-slate-900 text-slate-500';
    }
  };

  const getGradeLabel = (grade: BetGrade) => {
      switch(grade) {
          case 'STANDARD': return 'STANDARD';
          case 'LEAN': return 'LEAN';
          case 'OUTLIER': return '⚠️ OUTLIER';
          default: return 'PASS';
      }
  };

  // Enhanced Formatting Helper
  const formatOdds = (val: number, type: 'SPREAD' | 'ML') => {
      // Logic: 
      // SPREAD: 0 means "PK" (Pick'em). null means Missing.
      // ML: 0 means Missing (N/A). ML cannot be 0 (even money is +100).
      
      if (type === 'SPREAD') {
          if (val === 0) return 'PK';
          // Check for missing data passed as null? (Here we assume 0 is a valid Spread if strict check done elsewhere, but usually Spread is valid number)
          // In previous provider logic, spread defaults to 0 if missing. 
          // Ideally we check validity. But PK is common.
          return val > 0 ? `+${val}` : `${val}`;
      }

      if (type === 'ML') {
          if (!val || val === 0) return 'N/A';
          return val > 0 ? `+${val}` : `${val}`;
      }
      return `${val}`;
  };

  const getSteamBadge = (retail: number, sharp?: number) => {
      if (sharp === undefined || sharp === null) return null;
      const diff = Math.abs(retail - sharp);
      if (diff >= 1.0) {
          return <span className="text-[8px] bg-orange-600 text-white px-1 py-0.5 rounded font-bold ml-1 animate-pulse" title={`Sharp Divergence: ${diff.toFixed(1)}pts`}>🔥 STEAM</span>;
      }
      return null;
  };

  return (
    <>
    <div className="border border-slate-700 bg-slate-900/50 rounded-sm overflow-hidden flex flex-col h-full hover:border-slate-500 transition-colors group relative">
      
      {/* HEADER */}
      <div className="p-4 border-b border-slate-800 bg-slate-900 relative">
        <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-white tracking-wider font-mono">{game.matchup}</h3>
            
            <div className="flex gap-2 items-center">
                {/* DATA QUALITY INDICATOR */}
                {dataQuality.status === 'OFFICIAL' && (
                    <div className="flex items-center gap-1 text-[9px] bg-green-900/30 text-green-400 border border-green-800 px-1.5 rounded" title="All rotation players have official BRef ratings.">
                        <span>✓</span> VERIFIED
                    </div>
                )}
                {dataQuality.status === 'CALCULATED' && (
                    <div 
                        className="flex items-center gap-1 text-[9px] bg-yellow-900/30 text-yellow-500 border border-yellow-800 px-1.5 rounded cursor-help" 
                        title={`Using proxy stats for: ${dataQuality.culprits.join(', ')}`}
                    >
                        <span>⚠️</span> PROXY ({dataQuality.count})
                    </div>
                )}
                {dataQuality.status === 'DEFAULT' && (
                    <div 
                        className="flex items-center gap-1 text-[9px] bg-red-900/30 text-red-500 border border-red-800 px-1.5 rounded animate-pulse cursor-help" 
                        title={`MISSING DATA (Using Defaults) for: ${dataQuality.culprits.join(', ')}`}
                    >
                        <span>⛔</span> DEFAULT ({dataQuality.count})
                    </div>
                )}

                {isAdjusted && <span className="text-[9px] bg-yellow-900/50 text-yellow-500 border border-yellow-800 px-1 rounded animate-pulse">ADJUSTED</span>}
                <div className="relative">
                    <button 
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 px-1.5 rounded cursor-help"
                        onMouseEnter={() => setShowDebug(true)}
                        onMouseLeave={() => setShowDebug(false)}
                    >
                        🔬 PHYSICS
                    </button>
                    {showDebug && simulation.debug && (
                        <div className="absolute top-6 right-0 w-64 bg-black border border-slate-600 shadow-xl z-50 p-3 rounded text-[9px] font-mono pointer-events-none">
                            <div className="text-slate-500 border-b border-slate-800 mb-2 pb-1 uppercase font-bold text-center">Four Factors Physics</div>
                            
                            {simulation.debug.factors ? (
                                <>
                                    <div className="grid grid-cols-3 gap-1 mb-2 border-b border-slate-900 pb-2">
                                        <div className="text-slate-500 font-bold">METRIC</div>
                                        <div className="text-right text-slate-300">HOME</div>
                                        <div className="text-right text-slate-300">AWAY</div>

                                        <div className="text-slate-500">eFG%</div>
                                        <div className="text-right text-blue-300">{(simulation.debug.factors.home.efg * 100).toFixed(1)}%</div>
                                        <div className="text-right text-red-300">{(simulation.debug.factors.away.efg * 100).toFixed(1)}%</div>

                                        <div className="text-slate-500">TOV%</div>
                                        <div className="text-right text-blue-300">{simulation.debug.factors.home.tov.toFixed(1)}%</div>
                                        <div className="text-right text-red-300">{simulation.debug.factors.away.tov.toFixed(1)}%</div>

                                        <div className="text-slate-500">ORB%</div>
                                        <div className="text-right text-blue-300">{simulation.debug.factors.home.orb.toFixed(1)}%</div>
                                        <div className="text-right text-red-300">{simulation.debug.factors.away.orb.toFixed(1)}%</div>

                                        <div className="text-slate-500">FTr</div>
                                        <div className="text-right text-blue-300">{simulation.debug.factors.home.ftr.toFixed(3)}</div>
                                        <div className="text-right text-red-300">{simulation.debug.factors.away.ftr.toFixed(3)}</div>
                                    </div>
                                    <div className="flex justify-between items-center text-[9px] text-slate-400">
                                        <span>Proj Possessions:</span>
                                        <span className="font-bold text-green-400">{simulation.debug.factors.pace.toFixed(1)}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center text-slate-600 italic">Legacy Data - Re-run Sim</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
        
        <div className="flex gap-2 mb-2 text-[9px] font-mono">
           {(game.homeFatigue.isB2B || game.homeFatigue.is3in4) && (
               <div className="text-orange-400 border border-orange-900/50 px-1 rounded bg-orange-900/10">
                   HOME: {game.homeFatigue.isB2B ? 'B2B' : ''} {game.homeFatigue.is3in4 ? '3in4' : ''}
               </div>
           )}
           {(game.awayFatigue.isB2B || game.awayFatigue.is3in4) && (
               <div className="text-orange-400 border border-orange-900/50 px-1 rounded bg-orange-900/10">
                   AWAY: {game.awayFatigue.isB2B ? 'B2B' : ''} {game.awayFatigue.is3in4 ? '3in4' : ''}
               </div>
           )}
        </div>

        <div className="flex gap-2 mt-2">
            <button 
                onClick={() => setShowRoster('HOME')}
                className="text-[9px] px-2 py-1 border border-slate-700 hover:border-slate-400 rounded bg-slate-800 text-slate-300 transition-colors"
            >
                ROSTER: HOME {homeInactive.length > 0 && `(-${homeInactive.length})`}
            </button>
            <button 
                onClick={() => setShowRoster('AWAY')}
                className="text-[9px] px-2 py-1 border border-slate-700 hover:border-slate-400 rounded bg-slate-800 text-slate-300 transition-colors"
            >
                ROSTER: AWAY {awayInactive.length > 0 && `(-${awayInactive.length})`}
            </button>
        </div>
      </div>

      {/* THE GRID */}
      <div className="grid grid-cols-3 text-xs font-mono border-b border-slate-800 divide-x divide-slate-800">
        <div className="p-2 text-center text-slate-500 bg-slate-950">METRIC</div>
        <div className="p-2 text-center text-green-500 bg-slate-950">MODEL</div>
        <div className="p-2 text-center text-slate-400 bg-slate-950">VEGAS</div>

        {/* SPREAD */}
        <div className="p-3 font-bold text-slate-300 flex flex-col justify-center">
            SPREAD
            <span className="text-[9px] font-normal text-slate-600">Away - Home</span>
        </div>
        <div className="p-3 flex items-center justify-center font-bold text-white bg-green-900/10">
            {simulation.projectedSpread > 0 ? '+' : ''}{simulation.projectedSpread.toFixed(1)}
        </div>
        <div className="p-3 flex flex-col items-center justify-center text-slate-400">
             <div className="flex items-center">
                {formatOdds(game.market.spread_line, 'SPREAD')}
                {getSteamBadge(game.market.spread_line, game.market.pinSpread)}
             </div>
             {game.market.pinSpread !== undefined && (
                 <span className="text-[9px] text-slate-600 mt-1">PIN: {formatOdds(game.market.pinSpread, 'SPREAD')}</span>
             )}
        </div>

        {/* TOTAL */}
        <div className="p-3 font-bold text-slate-300 flex flex-col justify-center border-t border-slate-800">
            TOTAL
            <span className="text-[9px] font-normal text-slate-600">Points</span>
        </div>
        <div className="p-3 flex items-center justify-center font-bold text-white bg-green-900/10 border-t border-slate-800">
            {simulation.projectedTotal.toFixed(1)}
        </div>
        <div className="p-3 flex flex-col items-center justify-center text-slate-400 border-t border-slate-800">
             <div className="flex items-center">
                {game.market.total_line || 'N/A'}
                {getSteamBadge(game.market.total_line, game.market.pinTotal)}
             </div>
             {game.market.pinTotal !== undefined && (
                 <span className="text-[9px] text-slate-600 mt-1">PIN: {game.market.pinTotal}</span>
             )}
        </div>

        {/* MONEYLINE */}
        <div className="p-3 font-bold text-slate-300 flex flex-col justify-center border-t border-slate-800">
            MONEYLINE
            <span className="text-[9px] font-normal text-slate-600">Win Prob</span>
        </div>
        <div className="p-3 flex flex-col justify-center gap-1 font-bold text-white bg-green-900/10 border-t border-slate-800">
             <div className="flex justify-between w-full px-2">
                <span className="text-[9px] text-slate-500">H</span>
                <span>{(simulation.homeWinPct * 100).toFixed(0)}%</span>
             </div>
             <div className="flex justify-between w-full px-2">
                <span className="text-[9px] text-slate-500">A</span>
                <span>{((1 - simulation.homeWinPct) * 100).toFixed(0)}%</span>
             </div>
        </div>
        <div className="p-3 flex flex-col justify-center gap-1 text-slate-400 border-t border-slate-800">
             <div className="flex justify-between w-full px-2">
                <span className="text-[9px] text-slate-600">H</span>
                <span className="text-slate-300">{formatOdds(game.market.home_ml, 'ML')}</span>
             </div>
             <div className="flex justify-between w-full px-2">
                <span className="text-[9px] text-slate-600">A</span>
                <span className="text-slate-300">{formatOdds(game.market.away_ml, 'ML')}</span>
             </div>
             {game.market.pinHomeML !== undefined && (
                 <div className="flex justify-center w-full px-2 mt-1 pt-1 border-t border-slate-800/50">
                    <span className="text-[9px] text-slate-600">PIN: {formatOdds(game.market.pinHomeML, 'ML')}</span>
                 </div>
             )}
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 gap-4 bg-slate-900/30 flex-grow">
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Spread Diff</div>
            <div className={`font-mono font-bold text-lg ${Math.abs(spreadDiff) > 3 ? 'text-green-400' : 'text-slate-400'}`}>
                {Math.abs(spreadDiff).toFixed(1)} pts
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Win Prob</div>
            <div className="font-mono font-bold text-lg text-white">
                {(simulation.homeWinPct * 100).toFixed(0)}% <span className="text-[10px] text-slate-500">Home</span>
            </div>
          </div>
      </div>

      <div className="p-3 border-t border-slate-800 bg-slate-950 space-y-2">
        <div className="flex justify-between items-center mb-1">
             <div className="text-[9px] text-slate-600 uppercase tracking-widest">Identified Edges</div>
             <div className="text-[9px] text-slate-700">TIER STAKING</div>
        </div>
        
        {valueBets.length > 0 ? (
            <div className="flex flex-col gap-2">
                {valueBets.map((bet, idx) => (
                   <div key={idx} className={`flex justify-between items-center p-2 rounded border-l-2 ${getGradeStyles(bet.grade)} transition-colors`}>
                       <div className="flex flex-col">
                           <div className="flex items-center gap-2">
                               {bet.grade === 'OUTLIER' && <span className="text-xs">⚠️</span>}
                               <span className="font-bold text-xs uppercase">{bet.description}</span>
                           </div>
                           <span className="text-[9px] opacity-80 font-mono mt-0.5">
                               {formatOdds(bet.marketPrice, bet.betType === 'SPREAD' ? 'SPREAD' : 'ML')} • 
                               {bet.betType === 'MONEYLINE' 
                                   ? <span className="text-emerald-400 font-bold ml-1">{(bet.edgePercentage * 100).toFixed(1)}% ROI</span>
                                   : <span className="ml-1">{(bet.edgePercentage * 100).toFixed(1)}% Edge</span>
                               }
                           </span>
                       </div>
                       <button 
                         onClick={() => handleBetClick(bet, idx)}
                         disabled={addedBets.has(idx)}
                         className={`flex items-center space-x-1 px-3 py-1.5 rounded transition-all active:scale-95 ${addedBets.has(idx) ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50' : bet.grade === 'OUTLIER' ? 'bg-purple-900/30 hover:bg-purple-900/50 border border-purple-500/50' : 'bg-black/40 hover:bg-black/60 border border-white/10'}`}
                       >
                           {addedBets.has(idx) ? <span className="text-[10px] font-bold px-2">ADDED</span> : (
                               <div className="text-right leading-none">
                                   <div className="text-[9px] font-bold opacity-70 mb-0.5">{getGradeLabel(bet.grade)}</div>
                                   <div className="text-xs font-mono font-bold">
                                       {bet.grade === 'OUTLIER' ? 'FORCE' : `${bet.kellyUnits.toFixed(2)}u`}
                                   </div>
                               </div>
                           )}
                       </button>
                   </div>
                ))}
            </div>
        ) : (
            <div className="text-center text-[10px] text-slate-700 py-4 border border-slate-800 border-dashed rounded bg-slate-950/50">NO PLAYS FOUND</div>
        )}
      </div>
    </div>

    {showRoster && (
        <RosterModal 
            teamName={showRoster === 'HOME' ? game.homeTeamName : game.awayTeamName}
            players={showRoster === 'HOME' ? game.homeRoster : game.awayRoster}
            inactiveIds={showRoster === 'HOME' ? homeInactive : awayInactive}
            injuryMap={globalInjuryMap}
            onToggle={(id) => togglePlayer(id, showRoster === 'HOME')}
            onClose={() => setShowRoster(null)}
        />
    )}
    </>
  );
};
