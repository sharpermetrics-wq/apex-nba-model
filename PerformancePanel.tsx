
import React, { useRef, useState, useMemo } from 'react';
import { PortfolioMetrics, RecordStats } from '../services/StatsCalculator';
import { TrackedBet } from '../types/BetTypes';

interface PerformancePanelProps {
  bets: TrackedBet[];
  metrics: PortfolioMetrics;
  onExport: () => void;
  onImport: () => void;
  onImportResults: (file: File) => void;
  onImportClosingLines: (file: File) => void;
}

type GraphMode = 'LINE' | 'BAR';

export const PerformancePanel: React.FC<PerformancePanelProps> = ({ 
  bets,
  metrics, 
  onExport, 
  onImport, 
  onImportResults,
  onImportClosingLines 
}) => {
  const { netUnits, roi, categoryRecords, tierRecords } = metrics;
  const [graphMode, setGraphMode] = useState<GraphMode>('LINE');
  const resultsInputRef = useRef<HTMLInputElement>(null);
  const closingLinesInputRef = useRef<HTMLInputElement>(null);

  const handleResultsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
        onImportResults(e.target.files[0]);
        e.target.value = ''; // Reset
    }
  };

  const handleClosingLinesFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
        onImportClosingLines(e.target.files[0]);
        e.target.value = ''; // Reset
    }
  };

  // --- CHART DATA PREPARATION ---
  const chartData = useMemo(() => {
    // 1. Filter Closed Bets
    const closedBets = bets.filter(b => b.result !== 'Pending' && b.result !== 'Push');

    if (closedBets.length === 0) return { line: [], bar: [], min: 0, max: 0 };

    // Helper: Calculate profit for a single bet
    const getProfit = (b: TrackedBet) => {
        if (b.result === 'Loss') return -b.units;
        if (b.result === 'Win') {
            const decimal = b.odds > 0 ? (b.odds / 100) + 1 : (100 / Math.abs(b.odds)) + 1;
            return b.units * (decimal - 1);
        }
        return 0;
    };

    // 2. Aggregate by Date
    const dailyMap = new Map<string, number>();
    closedBets.forEach(b => {
        const current = dailyMap.get(b.dateStr) || 0;
        dailyMap.set(b.dateStr, current + getProfit(b));
    });

    // Sort dates to ensure time-series order
    const sortedDates = Array.from(dailyMap.keys()).sort();

    // 3. Build Datasets
    const lineData: { index: number, val: number, date: string }[] = [];
    const barData: { index: number, val: number, date: string }[] = [];
    
    let runningTotal = 0;

    sortedDates.forEach((date, i) => {
        const dailyProfit = dailyMap.get(date) || 0;
        
        // Bar Chart: Daily Profit
        barData.push({ index: i, val: dailyProfit, date });

        // Line Chart: Cumulative Profit (Daily steps)
        runningTotal += dailyProfit;
        lineData.push({ index: i, val: runningTotal, date });
    });

    // 4. Determine Scales
    const activeData = graphMode === 'LINE' ? lineData : barData;
    const allVals = activeData.map(d => d.val);
    const minVal = Math.min(0, ...allVals); // Always include 0
    const maxVal = Math.max(0, ...allVals);

    return { line: lineData, bar: barData, min: minVal, max: maxVal };
  }, [bets, graphMode]);

  // --- CHART RENDERING HELPERS ---
  const renderChart = () => {
      const data = graphMode === 'LINE' ? chartData.line : chartData.bar;
      if (data.length === 0) {
          return (
              <div className="h-40 flex items-center justify-center text-xs text-slate-600 font-mono border border-dashed border-slate-800 rounded">
                  NO GRADED DATA AVAILABLE
              </div>
          );
      }

      // Dimensions
      const width = 100; // ViewBox units
      const height = 50; 
      const padding = 5;
      
      const plotW = width - (padding * 2);
      const plotH = height - (padding * 2);

      // Y-Scale
      const range = chartData.max - chartData.min;
      const safeRange = range === 0 ? 1 : range; // Avoid divide by zero
      
      const getY = (val: number) => {
          // Invert Y (SVG 0 is top)
          const pct = (val - chartData.min) / safeRange;
          return (height - padding) - (pct * plotH);
      };

      const zeroY = getY(0);

      // LINE CHART RENDER
      if (graphMode === 'LINE') {
          const points = data.map((d, i) => {
              const x = padding + (i / (data.length - 1 || 1)) * plotW;
              const y = getY(d.val);
              return `${x},${y}`;
          }).join(' ');

          return (
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48 md:h-64 bg-slate-900/50 rounded border border-slate-800">
                  {/* Zero Line */}
                  <line x1={padding} y1={zeroY} x2={width-padding} y2={zeroY} stroke="#334155" strokeWidth="0.5" strokeDasharray="2" />
                  
                  {/* The Line */}
                  <polyline 
                    points={points} 
                    fill="none" 
                    stroke="#34d399" 
                    strokeWidth="1" 
                    vectorEffect="non-scaling-stroke"
                  />
                  
                  {/* Area Under Curve (Gradient) */}
                  <defs>
                    <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon 
                    points={`${padding},${getY(chartData.min)} ${points} ${width-padding},${getY(chartData.min)}`} 
                    fill="url(#gradient)" 
                  />

                  {/* End Dot */}
                  {data.length > 0 && (
                      <circle 
                        cx={padding + plotW} 
                        cy={getY(data[data.length-1].val)} 
                        r="1.5" 
                        fill="#34d399" 
                      />
                  )}

                  {/* Date Labels (Start/End) */}
                  <text x={padding} y={height-1} className="text-[3px] fill-slate-500 font-mono">{data[0].date.slice(5)}</text>
                  <text x={width-padding} y={height-1} textAnchor="end" className="text-[3px] fill-slate-500 font-mono">{data[data.length-1].date.slice(5)}</text>
              </svg>
          );
      }

      // BAR CHART RENDER
      if (graphMode === 'BAR') {
          const barWidth = (plotW / data.length) * 0.6; // 60% width of slot
          
          return (
             <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48 md:h-64 bg-slate-900/50 rounded border border-slate-800">
                  {/* Zero Line */}
                  <line x1={padding} y1={zeroY} x2={width-padding} y2={zeroY} stroke="#475569" strokeWidth="0.5" />

                  {data.map((d, i) => {
                      const x = padding + (i / data.length) * plotW + ((plotW/data.length - barWidth)/2);
                      const y = getY(Math.max(0, d.val));
                      const h = Math.abs(getY(d.val) - zeroY);
                      const isPositive = d.val >= 0;

                      return (
                          <rect 
                            key={i}
                            x={x}
                            y={isPositive ? getY(d.val) : zeroY}
                            width={barWidth}
                            height={Math.max(0.5, h)} // Min height for visibility
                            fill={isPositive ? '#34d399' : '#f87171'}
                            opacity="0.8"
                            rx="0.5"
                          >
                            <title>{d.date}: {d.val > 0 ? '+' : ''}{d.val.toFixed(2)}u</title>
                          </rect>
                      );
                  })}
                   {/* Date Labels (Start/End) */}
                  <text x={padding} y={height-1} className="text-[3px] fill-slate-500 font-mono">{data[0].date.slice(5)}</text>
                  <text x={width-padding} y={height-1} textAnchor="end" className="text-[3px] fill-slate-500 font-mono">{data[data.length-1].date.slice(5)}</text>
             </svg>
          );
      }
  };

  // Helper: Format Record string
  const fmt = (r: RecordStats) => `${r.wins}-${r.losses}-${r.pushes}`;
  
  // Helper: Format Net Units with color
  const fmtNet = (r: RecordStats) => {
      const n = r.net;
      const sign = n > 0 ? '+' : '';
      const color = n > 0 ? 'text-green-400' : n < 0 ? 'text-red-400' : 'text-slate-500';
      return <span className={`font-mono text-[9px] ${color}`}>{sign}{n.toFixed(2)}u</span>;
  };

  // Calculate Total Record
  const recordsArray = Object.values(categoryRecords) as RecordStats[];
  const totalWins = recordsArray.reduce((acc, r) => acc + r.wins, 0);
  const totalLosses = recordsArray.reduce((acc, r) => acc + r.losses, 0);
  const totalPushes = recordsArray.reduce((acc, r) => acc + r.pushes, 0);

  return (
    <div className="p-4 border-b border-slate-800 bg-slate-950">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-white font-bold tracking-tighter flex items-center gap-2">
           <span className="text-green-500">●</span> PERFORMANCE HUB
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN: METRICS */}
        <div>
            {/* ROW 1: THE BOTTOM LINE */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-900 p-2 rounded border border-slate-800 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Net Units</div>
                    <div className={`text-lg font-bold ${netUnits >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {netUnits > 0 ? '+' : ''}{netUnits.toFixed(2)}u
                    </div>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-800 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">ROI</div>
                    <div className={`text-lg font-bold ${roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {roi > 0 ? '+' : ''}{roi.toFixed(1)}%
                    </div>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-800 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Total W-L-P</div>
                    <div className="text-lg font-bold text-white">
                        {totalWins}-{totalLosses}-{totalPushes}
                    </div>
                </div>
            </div>

            {/* ROW 2: MARKET BREAKDOWN */}
            <div className="mb-1 text-[9px] text-slate-500 uppercase tracking-widest font-bold">By Market</div>
            <div className="grid grid-cols-4 gap-2 text-center mb-4">
                <div className="bg-slate-900/50 p-1.5 rounded border border-slate-800/50">
                    <div className="text-[8px] text-slate-500 mb-0.5">SPD</div>
                    <div className="text-xs font-bold text-slate-300 leading-none mb-1">{fmt(categoryRecords['Spread'])}</div>
                    {fmtNet(categoryRecords['Spread'])}
                </div>
                <div className="bg-slate-900/50 p-1.5 rounded border border-slate-800/50">
                    <div className="text-[8px] text-slate-500 mb-0.5">OVR</div>
                    <div className="text-xs font-bold text-slate-300 leading-none mb-1">{fmt(categoryRecords['Over'])}</div>
                    {fmtNet(categoryRecords['Over'])}
                </div>
                <div className="bg-slate-900/50 p-1.5 rounded border border-slate-800/50">
                    <div className="text-[8px] text-slate-500 mb-0.5">UND</div>
                    <div className="text-xs font-bold text-slate-300 leading-none mb-1">{fmt(categoryRecords['Under'])}</div>
                    {fmtNet(categoryRecords['Under'])}
                </div>
                <div className="bg-slate-900/50 p-1.5 rounded border border-slate-800/50">
                    <div className="text-[8px] text-slate-500 mb-0.5">ML</div>
                    <div className="text-xs font-bold text-slate-300 leading-none mb-1">{fmt(categoryRecords['Moneyline'])}</div>
                    {fmtNet(categoryRecords['Moneyline'])}
                </div>
            </div>

            {/* ROW 3: TIER BREAKDOWN (WITH OUTLIERS) */}
            <div className="mb-1 text-[9px] text-slate-500 uppercase tracking-widest font-bold">By Grade</div>
            <div className="grid grid-cols-3 gap-2 text-center mb-4">
                {/* STANDARD */}
                <div className="bg-slate-900/50 p-1.5 rounded border border-slate-800/50">
                    <div className="text-[8px] text-emerald-400 font-bold mb-0.5">STANDARD</div>
                    <div className="text-xs font-bold text-slate-300 leading-none mb-1">{fmt(tierRecords['STANDARD'])}</div>
                    {fmtNet(tierRecords['STANDARD'])}
                </div>
                
                {/* LEAN */}
                <div className="bg-slate-900/50 p-1.5 rounded border border-slate-800/50">
                    <div className="text-[8px] text-yellow-500 font-bold mb-0.5">LEAN</div>
                    <div className="text-xs font-bold text-slate-300 leading-none mb-1">{fmt(tierRecords['LEAN'])}</div>
                    {fmtNet(tierRecords['LEAN'])}
                </div>

                {/* OUTLIER */}
                <div className="bg-purple-900/20 p-1.5 rounded border border-purple-500/30">
                    <div className="text-[8px] text-purple-400 font-bold mb-0.5">OUTLIER</div>
                    <div className="text-xs font-bold text-slate-300 leading-none mb-1">{fmt(tierRecords['OUTLIER'])}</div>
                    {fmtNet(tierRecords['OUTLIER'])}
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN: VISUALIZATION */}
        <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Trend Analysis</div>
                <div className="flex bg-slate-900 p-0.5 rounded border border-slate-800">
                    <button 
                        onClick={() => setGraphMode('LINE')}
                        className={`text-[9px] px-2 py-0.5 rounded transition-colors ${graphMode === 'LINE' ? 'bg-slate-700 text-white font-bold' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        RUNNING
                    </button>
                    <button 
                        onClick={() => setGraphMode('BAR')}
                        className={`text-[9px] px-2 py-0.5 rounded transition-colors ${graphMode === 'BAR' ? 'bg-slate-700 text-white font-bold' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        DAILY
                    </button>
                </div>
            </div>
            
            {renderChart()}
            
            <div className="mt-2 text-[9px] text-slate-600 font-mono text-center">
                {graphMode === 'LINE' ? 'CUMULATIVE NET UNITS (DAILY)' : 'DAILY P&L PERFORMANCE'}
            </div>
        </div>
      </div>

      {/* ROW 4: ACTIONS */}
      <div className="grid grid-cols-2 gap-2 mt-6 border-t border-slate-900 pt-4">
         <div className="col-span-1 grid grid-cols-2 gap-2">
            <button 
                onClick={onExport} 
                className="bg-slate-900 hover:bg-black border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-[10px] uppercase font-bold py-3 rounded transition-all cursor-pointer"
            >
                Export JSON
            </button>
            <button 
                onClick={onImport} 
                className="bg-slate-900 hover:bg-black border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-[10px] uppercase font-bold py-3 rounded transition-all cursor-pointer"
            >
                Import JSON
            </button>
         </div>

         {/* INGESTION BUTTONS */}
         <div className="col-span-1 grid grid-cols-2 gap-2">
            <button 
                onClick={() => closingLinesInputRef.current?.click()} 
                className="flex items-center justify-center gap-1 bg-purple-900/20 hover:bg-purple-900/40 border border-purple-900/50 hover:border-purple-500 text-purple-400 hover:text-white text-[10px] uppercase font-bold py-3 rounded transition-all cursor-pointer group"
                title="Calculate Closing Line Value"
            >
                <span className="text-xs">📉</span> CLV AUDIT
            </button>
             <button 
                onClick={() => resultsInputRef.current?.click()} 
                className="flex items-center justify-center gap-1 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-900/50 hover:border-blue-500 text-blue-400 hover:text-white text-[10px] uppercase font-bold py-3 rounded transition-all cursor-pointer group"
            >
                <span className="text-xs">📊</span> RESULTS
            </button>
         </div>
      </div>

      <input 
        type="file" 
        ref={resultsInputRef} 
        onChange={handleResultsFile} 
        className="hidden" 
      />
       <input 
        type="file" 
        ref={closingLinesInputRef} 
        onChange={handleClosingLinesFile} 
        className="hidden" 
      />
    </div>
  );
};
