
import React, { useCallback, useState } from 'react';

interface DataUploaderProps {
  onStatsUpload: (file: File) => void;
  onOddsUpload: (file: File) => void;
  onFatigueUpload?: (file: File) => void; // Optional for compatibility
  hasStats: boolean;
  hasOdds: boolean;
  hasFatigue?: boolean;
  onProceed: () => void;
  onImport?: () => void;
  isLoading?: boolean;
}

export const DataUploader: React.FC<DataUploaderProps> = ({ 
  onStatsUpload, 
  onOddsUpload, 
  onFatigueUpload,
  hasStats, 
  hasOdds,
  hasFatigue = false,
  onProceed,
  onImport,
  isLoading = false
}) => {
  const [dragActiveStats, setDragActiveStats] = useState(false);
  const [dragActiveOdds, setDragActiveOdds] = useState(false);
  const [dragActiveFatigue, setDragActiveFatigue] = useState(false);

  // Stats Handler
  const handleStatsDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveStats(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onStatsUpload(e.dataTransfer.files[0]);
    }
  }, [onStatsUpload]);

  // Odds Handler
  const handleOddsDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveOdds(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onOddsUpload(e.dataTransfer.files[0]);
    }
  }, [onOddsUpload]);

  // Fatigue Handler
  const handleFatigueDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveFatigue(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0] && onFatigueUpload) {
      onFatigueUpload(e.dataTransfer.files[0]);
    }
  }, [onFatigueUpload]);

  const readyToProceed = hasStats && hasOdds; // Fatigue is optional but highly recommended

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 w-full max-w-7xl mx-auto animate-in fade-in zoom-in duration-300">
        <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-white mb-2 tracking-tighter">DATA INGESTION PROTOCOL</h2>
            <p className="text-slate-500 text-xs uppercase tracking-widest">
                MANUAL OVERRIDE: UPLOAD SOURCE FILES TO INITIALIZE ENGINE
            </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            
            {/* CARD 1: STATS CSV */}
            <div 
                className={`
                    relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300
                    flex flex-col items-center justify-center gap-4 cursor-pointer overflow-hidden shadow-2xl group min-h-[250px]
                    ${hasStats 
                        ? 'border-green-500 bg-green-950/30' 
                        : dragActiveStats ? 'border-blue-400 bg-blue-900/20' : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'}
                `}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActiveStats(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActiveStats(false); }}
                onDrop={handleStatsDrop}
            >
                <div className="relative z-10 pointer-events-none">
                    <div className="text-4xl mb-4">{hasStats ? '✅' : '📊'}</div>
                    <div>
                        <h3 className={`font-bold text-lg ${hasStats ? 'text-green-400' : 'text-slate-200'}`}>
                            {hasStats ? 'STATS LOCKED' : 'STEP 1: STATS'}
                        </h3>
                        <p className="text-[10px] text-slate-500 tracking-wider mt-1">
                            {hasStats ? 'READY' : 'DROP .CSV (BREF)'}
                        </p>
                    </div>
                </div>
                <input 
                    type="file" 
                    className="absolute inset-0 w-full h-full z-20 opacity-0 cursor-pointer"
                    onChange={(e) => {
                        if (e.target.files?.[0]) {
                            onStatsUpload(e.target.files[0]);
                            e.target.value = '';
                        }
                    }}
                />
            </div>

            {/* CARD 2: ODDS JSON */}
            <div 
                className={`
                    relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300
                    flex flex-col items-center justify-center gap-4 cursor-pointer overflow-hidden shadow-2xl group min-h-[250px]
                    ${hasOdds 
                        ? 'border-green-500 bg-green-950/30' 
                        : dragActiveOdds ? 'border-purple-400 bg-purple-900/20' : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'}
                `}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActiveOdds(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActiveOdds(false); }}
                onDrop={handleOddsDrop}
            >
                <div className="relative z-10 pointer-events-none">
                    <div className="text-4xl mb-4">{hasOdds ? '✅' : '🎲'}</div>
                    <div>
                        <h3 className={`font-bold text-lg ${hasOdds ? 'text-green-400' : 'text-slate-200'}`}>
                            {hasOdds ? 'ODDS LOCKED' : 'STEP 2: ODDS'}
                        </h3>
                        <p className="text-[10px] text-slate-500 tracking-wider mt-1">
                            {hasOdds ? 'READY' : 'DROP .JSON (ODDS)'}
                        </p>
                    </div>
                </div>
                <input 
                    type="file" 
                    className="absolute inset-0 w-full h-full z-20 opacity-0 cursor-pointer"
                    onChange={(e) => {
                        if (e.target.files?.[0]) {
                            onOddsUpload(e.target.files[0]);
                            e.target.value = '';
                        }
                    }}
                />
            </div>

            {/* CARD 3: FATIGUE JSON */}
            <div 
                className={`
                    relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300
                    flex flex-col items-center justify-center gap-4 cursor-pointer overflow-hidden shadow-2xl group min-h-[250px]
                    ${hasFatigue 
                        ? 'border-green-500 bg-green-950/30' 
                        : dragActiveFatigue ? 'border-orange-400 bg-orange-900/20' : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'}
                `}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActiveFatigue(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActiveFatigue(false); }}
                onDrop={handleFatigueDrop}
            >
                <div className="relative z-10 pointer-events-none">
                    <div className="text-4xl mb-4">{hasFatigue ? '✅' : '😴'}</div>
                    <div>
                        <h3 className={`font-bold text-lg ${hasFatigue ? 'text-green-400' : 'text-slate-200'}`}>
                            {hasFatigue ? 'FATIGUE LOCKED' : 'STEP 3: FATIGUE'}
                        </h3>
                        <p className="text-[10px] text-slate-500 tracking-wider mt-1">
                            {hasFatigue ? 'SCHEDULE CONTEXT LOADED' : 'DROP .JSON (OPTIONAL)'}
                        </p>
                    </div>
                </div>
                {onFatigueUpload && (
                    <input 
                        type="file" 
                        className="absolute inset-0 w-full h-full z-20 opacity-0 cursor-pointer"
                        onChange={(e) => {
                            if (e.target.files?.[0]) {
                                onFatigueUpload(e.target.files[0]);
                                e.target.value = '';
                            }
                        }}
                    />
                )}
            </div>
        </div>

        {/* ACTION AREA */}
        <div className="mt-10 flex flex-col items-center gap-4">
            {readyToProceed ? (
                <button 
                    onClick={onProceed}
                    disabled={isLoading}
                    className={`
                        bg-green-600 hover:bg-green-500 text-black font-bold text-sm tracking-widest px-10 py-4 rounded 
                        shadow-[0_0_20px_rgba(34,197,94,0.4)] transition-all transform hover:scale-105
                        ${isLoading ? 'opacity-70 cursor-wait animate-pulse' : 'animate-pulse'}
                    `}
                >
                    {isLoading ? 'INITIALIZING ENGINE...' : 'INITIALIZE APEX ENGINE >>'}
                </button>
            ) : (
                <div className="text-slate-600 text-xs font-mono animate-pulse">
                    WAITING FOR SOURCE FILES...
                </div>
            )}

            {onImport && !isLoading && (
                <div className="mt-6 border-t border-slate-800 pt-6 w-full text-center">
                    <button 
                        onClick={onImport}
                        className="text-[10px] text-slate-500 hover:text-white uppercase tracking-wider underline decoration-slate-700 hover:decoration-white transition-all"
                    >
                        OR RESTORE FROM SYSTEM BACKUP
                    </button>
                </div>
            )}
        </div>
    </div>
  );
};
