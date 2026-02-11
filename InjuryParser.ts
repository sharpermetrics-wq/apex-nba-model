
import { RawPlayerSeasonData } from '../types/PipelineTypes';

// Define the valid statuses based on user request
export type ParsedInjuryStatus = 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'PROBABLE' | 'DTD';

export class InjuryParser {

  /**
   * Normalizes a player name for comparison.
   * Removes accents, suffixes, and non-alphanumeric characters.
   */
  private static normalizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
      .replace(/\b(jr\.?|sr\.?|ii|iii|iv)\b/g, "")      
      .replace(/[^a-z]/g, "");                          
  }

  /**
   * Parses a CSV string of names and statuses.
   * 
   * RULES:
   * 1. Default Target: 5th Column (Index 4) for Status.
   * 2. Name Matching: Handles "First Last" and "Last, First".
   * 3. Logic:
   *    - "out" -> OUT
   *    - "questionable" -> QUESTIONABLE
   *    - "doubtful" -> DOUBTFUL
   *    - "probable" -> PROBABLE
   */
  public static parse(csvText: string, allPlayers: RawPlayerSeasonData[]): Record<string, ParsedInjuryStatus> {
    const injuryMap: Record<string, ParsedInjuryStatus> = {};
    const playerMap = new Map<string, string>();
    
    // 1. Build Lookup Map
    allPlayers.forEach(p => {
        const norm = this.normalizeName(p.name);
        playerMap.set(norm, p.id);
    });

    const cleanText = csvText.replace(/^\ufeff/, '');
    const lines = cleanText.split(/\r\n|\n|\r/);
    
    // Default to Index 4 (Column 5) as explicitly requested
    let statusIndex = 4; 
    let nameIndex = 0;

    // 2. Process Lines
    lines.forEach(line => {
        if (!line.trim()) return;

        // Smart split for CSV (handles quoted commas if necessary, though simple split often suffices for names)
        // Regex split handles: "Doe, John", Team, ...
        const columns = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, ''));
        
        if (columns.length <= statusIndex) return; 

        const rawName = columns[nameIndex];
        if (!rawName || rawName.toLowerCase() === 'player' || rawName.toLowerCase() === 'name') return;

        // Determine Status
        const rawStatus = columns[statusIndex] || '';
        const cleanStatus = rawStatus.toLowerCase();

        // 3. Match Player ID
        let matchedId = playerMap.get(this.normalizeName(rawName));

        // 3b. Try "Last, First" flip if direct match fails
        if (!matchedId && rawName.includes(',')) {
            const parts = rawName.split(',');
            if (parts.length === 2) {
                const flippedName = `${parts[1]} ${parts[0]}`; // "James, LeBron" -> "LeBron James"
                matchedId = playerMap.get(this.normalizeName(flippedName));
            }
        }

        if (matchedId) {
            // STRICT MAPPING LOGIC
            let status: ParsedInjuryStatus | null = null;

            if (cleanStatus.includes('out')) status = 'OUT';
            else if (cleanStatus.includes('questionable')) status = 'QUESTIONABLE';
            else if (cleanStatus.includes('doubtful')) status = 'DOUBTFUL';
            else if (cleanStatus.includes('probable')) status = 'PROBABLE';
            else if (cleanStatus.includes('gtd') || cleanStatus.includes('day')) status = 'QUESTIONABLE'; // Treat generic GTD as Q

            if (status) {
                injuryMap[matchedId] = status;
            }
        }
    });

    console.log(`[InjuryParser] Processed ${lines.length} lines. Mapped ${Object.keys(injuryMap).length} injuries.`);
    return injuryMap;
  }
}
