
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PipelineController } from './services/PipelineController';
import { HybridDataProvider, RawOddsGame } from './services/HybridDataProvider';
import { AnalyzedGame, RawPlayerSeasonData } from './types/PipelineTypes';
import { GameCard } from './components/GameCard';
import { DataUploader } from './components/DataUploader';
import { BetTracker } from './components/BetTracker';
import { PerformancePanel } from './components/PerformancePanel';
import { InjuryImport } from './components/InjuryImport';
import { BetTicket } from './types';
import { TrackedBet, BetCategory, BetResult, BetSnapshot } from './types/BetTypes';
import { StatsCalculator } from './services/StatsCalculator';
import { CsvParser } from './services/CsvParser';
import { ParsedInjuryStatus } from './services/InjuryParser';

type ViewMode = 'MARKET' | 'PORTFOLIO';

const App = () => {
  // --- STATE ---
  const [games, setGames] = useState<AnalyzedGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data Sources (Manual Uploads)
  const [playerStats, setPlayerStats] = useState<RawPlayerSeasonData[] | null>(null);
  const [marketData, setMarketData] = useState<RawOddsGame[] | null>(null);
  const [fatigueData, setFatigueData] = useState<Record<string, any> | null>(null);

  // Global State
  const [globalInjuryMap, setGlobalInjuryMap] = useState<Record<string, ParsedInjuryStatus>>({});
  const [trackedBets, setTrackedBets] = useState<TrackedBet[]>([]);
  const [activeView, setActiveView] = useState<ViewMode>('MARKET');
  
  const metrics = useMemo(() => StatsCalculator.compute(trackedBets), [trackedBets]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive Slate Date from first game
  const slateDate = useMemo(() => {
      if (games.length === 0) return null;
      return new Date(games[0].startTime).toLocaleDateString();
  }, [games]);

  // --- EFFECT: Load Persisted Bets ---
  useEffect(() => {
    const saved = localStorage.getItem('apex_bets_v3');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) setTrackedBets(parsed);
        } catch (e) { console.error("Failed load bets", e); }
    }
  }, []);

  // --- EFFECT: Save Bets ---
  useEffect(() => {
    localStorage.setItem('apex_bets_v3', JSON.stringify(trackedBets));
  }, [trackedBets]);

  // --- HANDLERS: Uploads ---
  const handleStatsFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            const data = CsvParser.parse(text);
            if (data.length > 0) {
                setPlayerStats(data);
                setError(null);
            } else {
                setError("STATS ERROR: No valid players found in CSV.");
            }
        } catch (err) {
            setError("FAILED TO PARSE STATS CSV.");
        }
    };
    reader.readAsText(file);
  };

  const handleOddsFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            const json = JSON.parse(text);
            if (Array.isArray(json)) {
                setMarketData(json);
                setError(null);
            } else {
                setError("ODDS ERROR: JSON must be an array of games.");
            }
        } catch (err) {
            setError("FAILED TO PARSE ODDS JSON.");
        }
    };
    reader.readAsText(file);
  };

  const handleFatigueFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            const json = JSON.parse(text);
            setFatigueData(json);
        } catch (err) {
            setError("FAILED TO PARSE FATIGUE JSON.");
        }
    };
    reader.readAsText(file);
  };

  // --- HANDLER: Run Pipeline ---
  const handleInitializeEngine = async () => {
    if (!playerStats || !marketData) return;
    
    setLoading(true);
    setError(null);

    try {
        // Init Provider with Manual Data (incl. Fatigue)
        const provider = new HybridDataProvider(playerStats, marketData, fatigueData);
        const controller = new PipelineController(provider);
        const results = await controller.runAnalysis(new Date(), '2024');
        
        if (results.length === 0) {
             setError("ENGINE INITIALIZED BUT NO MATCHING GAMES FOUND. CHECK CONSOLE FOR DATE FILTERING LOGS.");
        } else {
             setGames(results);
             setActiveView('MARKET');
        }
    } catch (e: any) {
        console.error("Pipeline Error:", e);
        setError(e.message || "CRITICAL ENGINE FAILURE");
    } finally {
        setLoading(false);
    }
  };

  // --- HANDLER: Bet Management ---
  const handleAddBet = (ticket: BetTicket, matchup: string, snapshot: BetSnapshot, explicitCategory?: BetCategory) => {
    let category: BetCategory = 'Moneyline';
    if (explicitCategory) category = explicitCategory;
    else if (ticket.betType === 'SPREAD') category = 'Spread';
    else if (ticket.betType === 'TOTAL') category = ticket.description.includes('Over') ? 'Over' : 'Under';

    const newBet: TrackedBet = {
        id: `${matchup}-${ticket.betType}-${Date.now()}`,
        game: matchup,
        pick: ticket.description,
        category,
        odds: ticket.marketPrice,
        units: ticket.kellyUnits,
        edge: ticket.edgePercentage,
        grade: ticket.grade,
        result: 'Pending',
        timestamp: Date.now(),
        dateStr: new Date().toISOString().split('T')[0],
        snapshot: snapshot
    };
    
    // De-dupe
    if (!trackedBets.find(b => b.game === matchup && b.pick === ticket.description && Date.now() - b.timestamp < 2000)) {
        setTrackedBets(prev => [newBet, ...prev]);
    }
  };

  const handleRemoveBet = (id: string) => setTrackedBets(prev => prev.filter(b => b.id !== id));
  
  const handleUpdateResult = (id: string, result: BetResult) => {
    setTrackedBets(prev => prev.map(bet => bet.id === id ? { ...bet, result } : bet));
  };

  // --- HANDLER: System Import/Export ---
  const handleExport = () => {
    const backup = {
        type: 'APEX_BACKUP', version: '3.1', timestamp: Date.now(),
        data: { bets: trackedBets, injuryMap: globalInjuryMap, metrics }
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `apex_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  };

  const handleSystemImport = () => fileInputRef.current?.click();

  const handleSystemFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    
    reader.onload = (evt) => {
        try {
            const json = JSON.parse(evt.target?.result as string);
            
            // Helper function to merge bets without duplicates
            const mergeBets = (importedBets: TrackedBet[]) => {
                setTrackedBets(prev => {
                    const currentIds = new Set(prev.map(b => b.id));
                    const uniqueImported = importedBets.filter(b => !currentIds.has(b.id));
                    return [...prev, ...uniqueImported];
                });
            };

            if (json.type === 'APEX_BACKUP' && json.data) {
                // 1. Merge Bets
                if (json.data.bets && Array.isArray(json.data.bets)) {
                    mergeBets(json.data.bets);
                }
                
                // 2. Merge Injuries
                if (json.data.injuryMap) {
                    setGlobalInjuryMap(prev => ({ ...json.data.injuryMap, ...prev }));
                }
                
                setActiveView('PORTFOLIO');
            } else if (Array.isArray(json)) {
                // Legacy Array Format
                mergeBets(json);
                setActiveView('PORTFOLIO');
            }
        } catch (err) { 
            console.error(err);
            alert("Invalid Backup File"); 
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  // --- HANDLER: Results Ingestion (INVERTED CONTAINMENT MATCHING) ---
  const handleResultsFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = evt.target?.result as string;
        const json = JSON.parse(raw);
        console.log("Loaded Results Raw:", json);

        // Normalize: Handle { results: [] } or raw array []
        const results = Array.isArray(json) ? json : (json.results || json.games || []);
        console.log(`Processing ${results.length} results.`);

        if (results.length === 0) {
          alert("No games found in the uploaded JSON.");
          return;
        }

        let updates = 0;

        setTrackedBets(currentBets => {
            return currentBets.map(bet => {
                // Skip already graded bets to prevent overwrites (unless manually cleared)
                if (bet.actualHomeScore) return bet;

                const betString = bet.game.toUpperCase(); // e.g. "LAL @ GSW"

                // FIND MATCH
                const match = results.find((r: any) => {
                    // Robust Key Extraction
                    const rHome = (r.homeTeam || r.home_team || r.home || r.hometeam || r.HomeTeam || r.team_home || '').toUpperCase();
                    const rAway = (r.awayTeam || r.away_team || r.away || r.awayteam || r.AwayTeam || r.team_away || '').toUpperCase();

                    if (!rHome || !rAway) return false;

                    // STRICT INVERTED CONTAINMENT:
                    // The Bet String MUST contain BOTH team names from the result.
                    // This is strict. If Result="LAL", Bet="LAL @ GSW", it works.
                    // If Result="Lakers", Bet="LAL @ GSW", it fails (unless bet is "Lakers vs Warriors").
                    // This avoids matching "BOS" to empty string or generic terms.
                    
                    const hasHome = betString.includes(rHome);
                    const hasAway = betString.includes(rAway);
                    
                    return hasHome && hasAway;
                });

                if (match) {
                    updates++;
                    // Robust Score Extraction
                    const hScore = Number(match.homeScore ?? match.home_score ?? match.score_home ?? match.home_pts ?? match.HomeScore);
                    const aScore = Number(match.awayScore ?? match.away_score ?? match.score_away ?? match.away_pts ?? match.AwayScore);

                    if (isNaN(hScore) || isNaN(aScore)) return bet;

                    // --- AUTO-GRADING LOGIC ---
                    let result: BetResult = 'Pending';
                    const pickUpper = bet.pick.toUpperCase();
                    
                    const rHomeName = (match.homeTeam || match.home_team || match.home || '').toUpperCase();
                    
                    // Moneyline
                    if (bet.category === 'Moneyline') {
                        const homeWins = hScore > aScore;
                        const pickedHome = pickUpper.includes(rHomeName) || pickUpper.includes('HOME');
                        
                        if (pickedHome) result = homeWins ? 'Win' : 'Loss';
                        else result = !homeWins ? 'Win' : 'Loss';
                    }
                    // Spread
                    else if (bet.category === 'Spread') {
                        const lineMatch = bet.pick.match(/[+-]?\d+(\.\d+)?/);
                        if (lineMatch) {
                             const line = parseFloat(lineMatch[0]);
                             const pickedHome = pickUpper.includes(rHomeName) || pickUpper.includes('HOME');
                             
                             const pickedScore = pickedHome ? hScore : aScore;
                             const oppScore = pickedHome ? aScore : hScore;
                             const adjScore = pickedScore + line;
                             
                             if (adjScore === oppScore) result = 'Push';
                             else result = adjScore > oppScore ? 'Win' : 'Loss';
                        }
                    }
                    // Totals
                    else if (bet.category === 'Over' || pickUpper.includes('OVER')) {
                         const lineMatch = bet.pick.match(/(\d+(\.\d+)?)/);
                         if (lineMatch) {
                             const line = parseFloat(lineMatch[0]);
                             const total = hScore + aScore;
                             if (total === line) result = 'Push';
                             else result = total > line ? 'Win' : 'Loss';
                         }
                    }
                    else if (bet.category === 'Under' || pickUpper.includes('UNDER')) {
                         const lineMatch = bet.pick.match(/(\d+(\.\d+)?)/);
                         if (lineMatch) {
                             const line = parseFloat(lineMatch[0]);
                             const total = hScore + aScore;
                             if (total === line) result = 'Push';
                             else result = total < line ? 'Win' : 'Loss';
                         }
                    }

                    return {
                        ...bet,
                        actualHomeScore: hScore,
                        actualAwayScore: aScore,
                        result: result
                    };
                }
                return bet;
            });
        });

        setTimeout(() => {
            alert(`Scanned ${results.length} results. Updated ${updates} tickets.`);
        }, 100);

      } catch (err) {
        console.error("Results Import Error:", err);
        alert("Failed to parse Results JSON.");
      }
    };
    reader.readAsText(file);
  };

  // --- HANDLER: Closing Lines Audit ---
  const handleClosingLinesUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const json = JSON.parse(evt.target?.result as string);
            if (!Array.isArray(json)) throw new Error("Closing odds must be an array");

            const normalize = (s: string) => s.replace(/[^a-zA-Z]/g, '').toLowerCase();
            let matchedCount = 0;

            // Helper to get nested properties safely (similar to HybridDataProvider)
            const getVal = (obj: any, keys: string[]) => {
                for (const k of keys) {
                    const found = Object.keys(obj).find(key => key.toLowerCase() === k.toLowerCase());
                    if (found) return obj[found];
                }
                return undefined;
            };

            setTrackedBets(prev => prev.map(bet => {
                // Only process pending bets? No, process all for audit history.
                const parts = bet.game.split(/ @ | vs /);
                if (parts.length !== 2) return bet;

                const betAway = normalize(parts[0]);
                const betHome = normalize(parts[1]);

                // Find matching game in closing odds JSON
                const match = json.find((g: any) => {
                    const gHome = normalize(getVal(g, ['home_team', 'home', 'hometeam']) || '');
                    const gAway = normalize(getVal(g, ['away_team', 'away', 'awayteam']) || '');
                    return (gHome.includes(betHome) || betHome.includes(gHome)) && 
                           (gAway.includes(betAway) || betAway.includes(gAway));
                });

                if (match) {
                    matchedCount++;
                    
                    // Extract Closing Lines
                    const closingSpreadHome = Number(getVal(match, ['spread', 'spread_line', 'home_spread']) || 0);
                    const closingTotal = Number(getVal(match, ['total', 'total_line', 'over_under']) || 0);

                    // Extract Bet Line from Pick string
                    const lineMatch = bet.pick.match(/[+-]?\d+(\.\d+)?/);
                    const betLine = lineMatch ? parseFloat(lineMatch[0]) : 0;
                    
                    let clv = 0;
                    let relevantClosingLine = 0;

                    // CLV CALCULATION LOGIC
                    if (bet.category === 'Spread') {
                        const isHomePick = bet.pick.includes('Home');
                        
                        // If I bet Home, my relevant closing line is the Home Spread.
                        // If I bet Away, my relevant closing line is the Away Spread (-1 * Home Spread).
                        relevantClosingLine = isHomePick ? closingSpreadHome : (-1 * closingSpreadHome);
                        
                        // CLV = (Bet Line - Closing Line)
                        // Example: Bet Home -4.5. Close -5.5.  -4.5 - (-5.5) = +1.0 (Good)
                        // Example: Bet Away +4.5. Close +3.5.   4.5 - 3.5 = +1.0 (Good)
                        clv = betLine - relevantClosingLine;

                    } else if (bet.category === 'Over') {
                        relevantClosingLine = closingTotal;
                        // Bet Over 210. Close 212. CLV = 212 - 210 = +2.0 (Good)
                        clv = closingTotal - betLine;
                        
                    } else if (bet.category === 'Under') {
                        relevantClosingLine = closingTotal;
                        // Bet Under 212. Close 210. CLV = 212 - 210 = +2.0 (Good)
                        clv = betLine - closingTotal;
                    }

                    if (relevantClosingLine !== 0) {
                        return {
                            ...bet,
                            closingLine: relevantClosingLine,
                            clv: Number(clv.toFixed(1))
                        };
                    }
                }
                return bet;
            }));

            alert(`Closing Lines Audited.\nMatched Games: ${matchedCount}`);

        } catch (e) {
            console.error("Closing Lines Import Error", e);
            alert("Failed to parse closing lines JSON.");
        }
    };
    reader.readAsText(file);
  };

  // --- HANDLER: New Slate ---
  const handleNewSlate = () => {
      if (window.confirm("RESET SLATE? This clears current market/stats data. Portfolio remains.")) {
          setLoading(false);
          setError(null);
          setPlayerStats(null);
          setMarketData(null);
          setFatigueData(null);
          setGames([]);
          setGlobalInjuryMap({});
          setActiveView('MARKET');
      }
  };

  // --- VIEW LOGIC ---
  const isUnlocked = games.length > 0 || trackedBets.length > 0;
  const isUploadMode = !isUnlocked || (isUnlocked && activeView === 'MARKET' && games.length === 0);

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-200 font-mono flex flex-col overflow-hidden selection:bg-green-900 selection:text-white">
      
      {/* HEADER */}
      <header className="w-full flex-shrink-0 border-b border-slate-800 bg-black z-10 overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 min-w-max gap-6">
            <div className="flex items-center gap-4 md:gap-8">
                <div>
                  <h1 className="text-xl md:text-2xl font-bold tracking-tighter text-white leading-none">
                    APEX <span className="text-xs align-top text-green-500 opacity-80">TERMINAL</span>
                  </h1>
                  <p className="text-[8px] md:text-[9px] uppercase tracking-[0.2em] text-slate-500">
                    Manual Override Protocol
                  </p>
                </div>
                
                {isUnlocked && (
                    <nav className="flex items-center gap-1 bg-slate-900/50 p-1 rounded border border-slate-800">
                        <button onClick={() => setActiveView('MARKET')} className={`px-3 md:px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded ${activeView === 'MARKET' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>Market</button>
                        <button onClick={() => setActiveView('PORTFOLIO')} className={`px-3 md:px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded ${activeView === 'PORTFOLIO' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>Portfolio ({trackedBets.length})</button>
                    </nav>
                )}
            </div>
            
            <div className="flex items-center gap-3 md:gap-4">
                {isUnlocked && slateDate && (
                    <div className="text-[10px] text-slate-400 border border-slate-800 px-2 py-1 rounded bg-slate-900/50 whitespace-nowrap">
                        SLATE: <span className="text-white font-bold">{slateDate}</span>
                    </div>
                )}
                {games.length > 0 && (
                    <button onClick={handleNewSlate} className="text-[10px] font-bold text-blue-400 border border-blue-900/50 px-3 py-1.5 rounded hover:bg-blue-900/20 whitespace-nowrap">⚡ NEW</button>
                )}
                {games.length > 0 && <InjuryImport allPlayers={playerStats || []} onImport={setGlobalInjuryMap} />}
                <div className="text-xs hidden md:block text-right border-l border-slate-800 pl-4 whitespace-nowrap">
                    <div className="text-slate-600 text-[9px] uppercase">System</div>
                    <div className="text-green-400 font-bold">READY</div>
                </div>
            </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto bg-slate-950 relative z-0">
          
          {/* UPLOADER VIEW */}
          {isUploadMode && (
              <div className="h-full flex flex-col">
                  {error && (
                      <div className="bg-red-900/20 text-red-400 text-center py-2 text-xs font-bold border-b border-red-900/30">
                          SYSTEM ALERT: {error}
                      </div>
                  )}
                  <DataUploader 
                    onStatsUpload={handleStatsFile}
                    onOddsUpload={handleOddsFile}
                    onFatigueUpload={handleFatigueFile}
                    hasStats={!!playerStats}
                    hasOdds={!!marketData}
                    hasFatigue={!!fatigueData}
                    onProceed={handleInitializeEngine}
                    onImport={handleSystemImport}
                    isLoading={loading}
                  />
              </div>
          )}

          {/* MARKET GRID VIEW */}
          {!isUploadMode && activeView === 'MARKET' && (
             <div className="p-6">
                {/* Note: In upload mode, loading is handled by DataUploader button state. 
                    This spinner is only for re-runs if we ever add that feature here. */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-[60vh] text-green-500 animate-pulse">
                        <div className="text-xl mb-2">>>> PROCESSING SYNDICATE PIPELINE</div>
                        <div className="text-xs text-slate-500">CORRELATING DATA STREAMS</div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                        {games.map(game => (
                            <GameCard 
                                key={game.gameId} 
                                game={game} 
                                globalInjuryMap={globalInjuryMap}
                                onBet={handleAddBet}
                            />
                        ))}
                    </div>
                )}
             </div>
          )}

          {/* PORTFOLIO VIEW */}
          {!isUploadMode && activeView === 'PORTFOLIO' && (
             <div className="p-6 max-w-6xl mx-auto space-y-6">
                 <PerformancePanel 
                    bets={trackedBets}
                    metrics={metrics} 
                    onExport={handleExport} 
                    onImport={handleSystemImport} 
                    onImportResults={handleResultsFile}
                    onImportClosingLines={handleClosingLinesUpload}
                 />
                 <BetTracker bets={trackedBets} onRemove={handleRemoveBet} onUpdateResult={handleUpdateResult} />
             </div>
          )}
      </main>

      <input type="file" ref={fileInputRef} onChange={handleSystemFileChange} className="hidden" />
    </div>
  );
};

export default App;
