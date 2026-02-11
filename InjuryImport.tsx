
import React, { useRef, useState } from 'react';
import { RawPlayerSeasonData } from '../types/PipelineTypes';
import { InjuryParser, ParsedInjuryStatus } from '../services/InjuryParser';

interface InjuryImportProps {
  allPlayers: RawPlayerSeasonData[];
  onImport: (injuryMap: Record<string, ParsedInjuryStatus>) => void;
}

export const InjuryImport: React.FC<InjuryImportProps> = ({ allPlayers, onImport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if (text) {
            const map = InjuryParser.parse(text, allPlayers);
            const count = Object.keys(map).length;
            
            onImport(map);
            setStatus(`MAPPED ${count} STATUSES`);
            
            // Clear status after 3 seconds
            setTimeout(() => setStatus(null), 3000);
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  return (
    <div className="flex items-center">
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFile} 
            accept=".csv,text/csv,application/vnd.ms-excel,text/plain" 
            className="hidden" 
        />
        
        <div className="flex items-center gap-2">
            {status && (
                <span className="text-[10px] text-green-400 font-bold animate-pulse border border-green-900 bg-green-900/20 px-2 py-1 rounded whitespace-nowrap">
                    {status}
                </span>
            )}
            
            <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] uppercase font-bold text-red-400 hover:text-white border border-red-900/50 hover:bg-red-900/50 px-3 py-1.5 rounded transition-colors flex items-center gap-2 whitespace-nowrap"
                title="Upload CSV: Name, Status"
            >
                <span className="text-lg leading-none">🚑</span> IMPORT INJURIES
            </button>
        </div>
    </div>
  );
};
