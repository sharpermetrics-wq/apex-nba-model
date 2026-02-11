
import { Player, Rotation, RotationEntry, Position } from './types';

export class RotationEngine {
  private static GAME_MINUTES = 240;
  private static POSITION_MINUTES = 48;

  /**
   * Distributes exactly 240 minutes across the active roster.
   * Logic: 
   * 1. Groups players by position.
   * 2. Identifies 'Void Minutes' from inactive players.
   * 3. Redistributes Void Minutes to active players at that position weighted by depth chart order.
   * 4. Normalizes to ensure exactly 240 minutes total.
   */
  public static distributeMinutes(roster: Player[]): Rotation {
    const activePlayers = roster.filter(p => p.status === 'ACTIVE');
    const inactivePlayers = roster.filter(p => p.status !== 'ACTIVE');

    // Initialize map to track minutes per player
    const allocationMap = new Map<string, number>();

    // Positions to iterate through
    const positions: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

    positions.forEach(pos => {
      this.allocateForPosition(pos, roster, allocationMap);
    });

    // Create Entries
    const entries: RotationEntry[] = [];
    let currentTotalMins = 0;

    activePlayers.forEach(p => {
      const minutes = allocationMap.get(p.id) || 0;
      currentTotalMins += minutes;
      
      entries.push({
        playerId: p.id,
        projected_minutes: minutes,
        // Usage share is roughly (Season USG * (Minutes / 48) / 5) - simplified for Phase 1
        usage_share: p.stats.usg_pct * (minutes / this.GAME_MINUTES)
      });
    });

    // Final Safety Valve: Normalize to exactly 240 due to rounding errors
    // or if a position group was entirely depleted.
    if (Math.abs(currentTotalMins - this.GAME_MINUTES) > 0.1) {
      const correctionFactor = this.GAME_MINUTES / currentTotalMins;
      entries.forEach(e => {
        e.projected_minutes *= correctionFactor;
        e.projected_minutes = Number(e.projected_minutes.toFixed(2));
      });
    }

    return {
      entries,
      total_minutes: entries.reduce((acc, curr) => acc + curr.projected_minutes, 0)
    };
  }

  private static allocateForPosition(
    pos: Position, 
    fullRoster: Player[], 
    allocationMap: Map<string, number>
  ) {
    const playersAtPos = fullRoster.filter(p => p.position === pos);
    const activeAtPos = playersAtPos.filter(p => p.status === 'ACTIVE');
    
    // If no active players at this position, we have a "Small Ball" or "Big Ball" situation.
    // Phase 1 assumption: There is always at least one player eligible for the position.
    if (activeAtPos.length === 0) return;

    // 1. Sum the "Base Minutes" (Season Avg) of the active players
    let currentAllocated = activeAtPos.reduce((sum, p) => sum + p.season_minutes_avg, 0);

    // 2. Identify the "Void" (Target 48 mins - Currently Allocated)
    // Note: If starters play heavy minutes (e.g. 35), 2 active players might exceed 48 season avg.
    // We strictly aim for 48 minutes per position slot for the model baseline.
    let minutesToDistribute = this.POSITION_MINUTES;

    // Weight calculation for redistribution
    // Lower depth_order (1) is better. We invert it for weighting.
    // Weight = 1 / depth_order. 
    // Starter (1) gets weight 1. Backup (2) gets 0.5. Deep (3) gets 0.33.
    const totalWeight = activeAtPos.reduce((sum, p) => sum + (1 / p.depth_order), 0);

    activeAtPos.forEach(p => {
      const weight = (1 / p.depth_order);
      const share = weight / totalWeight;
      
      // Allocate the 48 minutes based on this weighted share
      // This ensures if a Starter is OUT, the backup gets the lion's share 
      // of the minutes compared to the 3rd stringer.
      let allocated = minutesToDistribute * share;

      // Cap at physical max (e.g., 42 mins) to prevent inhuman projections
      if (allocated > 42) allocated = 42;
      
      allocationMap.set(p.id, Number(allocated.toFixed(2)));
    });
  }
}
