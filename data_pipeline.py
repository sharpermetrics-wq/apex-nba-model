import json
import os
import requests
from datetime import datetime

# -------------------------------------------------------------------------
# APEX DATA PIPELINE (PHASE 6)
# -------------------------------------------------------------------------
# Validates environment and imports
try:
    from nba_api.stats.endpoints import leaguedashplayerstats, scoreboardv2
    from nba_api.stats.static import teams
except ImportError:
    print("❌ Error: 'nba_api' not found.")
    print("👉 Please run: pip install nba_api requests")
    exit()

# CONFIGURATION
SEASON = '2024-25'
DATA_DIR = os.path.join(os.getcwd(), 'public', 'data')
OUTPUT_FILE = os.path.join(DATA_DIR, 'apex_db.json')

# Headers to mimic a browser
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Referer': 'https://www.nba.com/',
    'Origin': 'https://www.nba.com/'
}

def get_team_map():
    """Creates a lookup for Team ID -> Abbreviation (e.g. 1610612737 -> ATL)"""
    nba_teams = teams.get_teams()
    team_map = {}
    for team in nba_teams:
        team_map[team['id']] = team['abbreviation']
    return team_map

def fetch_schedule(team_map):
    """Fetches today's games via ScoreboardV2"""
    print(f"📅 Fetching Schedule for Today...")
    try:
        # ScoreboardV2 gets games for the current date by default
        board = scoreboardv2.ScoreboardV2(headers=HEADERS, timeout=30)
        games_dict = board.get_normalized_dict()['GameHeader']
        
        schedule = []
        for g in games_dict:
            home_id = g['HOME_TEAM_ID']
            visitor_id = g['VISITOR_TEAM_ID']
            
            game_obj = {
                "gameId": g['GAME_ID'],
                "date": g['GAME_DATE_EST'], # Format: 2024-01-30T00:00:00
                "homeTeamId": team_map.get(home_id, 'UNK'),
                "awayTeamId": team_map.get(visitor_id, 'UNK'),
                "sequence": g['GAME_SEQUENCE']
            }
            schedule.append(game_obj)
            
        return schedule
    except Exception as e:
        print(f"❌ Error fetching schedule: {e}")
        return []

def fetch_player_stats():
    """Fetches Advanced Player Stats (Per 100 Possessions)"""
    print(f"🏀 Fetching Player Stats ({SEASON}, Per 100 Possessions)...")
    try:
        stats = leaguedashplayerstats.LeagueDashPlayerStats(
            season=SEASON,
            per_mode_detailed='Per100Possessions',
            headers=HEADERS,
            timeout=30
        )
        return stats.get_normalized_dict()['LeagueDashPlayerStats']
    except Exception as e:
        print(f"❌ Error fetching stats: {e}")
        return []

def process_data():
    # 1. Setup Maps
    team_map = get_team_map()
    
    # 2. Fetch Data
    raw_schedule = fetch_schedule(team_map)
    raw_players = fetch_player_stats()
    
    # 3. Process Players into a Hash Map (Key = PlayerID)
    players_db = {}
    print(f"⚙️ Processing {len(raw_players)} players...")
    
    for p in raw_players:
        pid = str(p['PLAYER_ID'])
        
        # Calculate derived metrics if missing
        fga = p.get('FGA', 0)
        fta = p.get('FTA', 0)
        ftr = (fta / fga) if fga > 0 else 0.0
        
        players_db[pid] = {
            "id": pid,
            "name": p['PLAYER_NAME'],
            "team": p['TEAM_ABBREVIATION'],
            "gp": p['GP'],
            "min": p['MIN'],
            "stats": {
                "pts_per_100": p['PTS'],
                "ortg": p.get('OFF_RATING', 0),
                "drtg": p.get('DEF_RATING', 0),
                "usg_pct": p['USG_PCT'] * 100 if p['USG_PCT'] < 1 else p['USG_PCT'], # Handle decimals vs whole nums
                "efg_pct": p['EFG_PCT'],
                "tov_pct": p.get('TM_TOV_PCT', 0) * 100 if p.get('TM_TOV_PCT', 0) < 1 else p.get('TM_TOV_PCT', 0),
                "orb_pct": p['OREB_PCT'] * 100 if p['OREB_PCT'] < 1 else p['OREB_PCT'],
                "ftr": ftr
            }
        }

    # 4. Construct Final DB
    apex_db = {
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "season": SEASON
        },
        "games": raw_schedule,
        "players": players_db
    }
    
    return apex_db

def main():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    
    db = process_data()
    
    if db['players'] and db['games']:
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(db, f, indent=2)
        print(f"💾 DATABASE SAVED: {OUTPUT_FILE}")
        print(f"   Players: {len(db['players'])}")
        print(f"   Games: {len(db['games'])}")
    else:
        print("⚠️ Failed to generate complete database.")

if __name__ == "__main__":
    main()