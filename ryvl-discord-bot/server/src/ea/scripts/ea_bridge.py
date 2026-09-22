import sys
import json
from typing import Any
from curl_cffi import requests

EA_BASE_URL = "https://proclubs.ea.com/api/fc"
EA_CREST_TEMPLATE = "https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l{identifier}.png"
EA_DEFAULT_CREST = "https://media.contentapi.ea.com/content/dam/ea/fc/common/global/tertiary-logo.svg"

HEADERS = {
    "Referer": "https://www.ea.com/",
    "Origin": "https://www.ea.com",
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

def get_crest_url(team_id: Any = None, crest_asset_id: Any = None) -> str:
    identifier = team_id or crest_asset_id
    return EA_CREST_TEMPLATE.format(identifier=identifier) if identifier else EA_DEFAULT_CREST

def do_get(path: str, params: dict[str, str]) -> Any:
    url = f"{EA_BASE_URL}{path}"
    response = requests.get(
        url,
        params=params,
        impersonate="chrome120",
        headers=HEADERS,
        timeout=15.0
    )
    if response.status_code != 200:
        raise RuntimeError(f"EA API error: HTTP {response.status_code} - {response.text[:300]}")
    return response.json()

def cmd_search(platform: str, query: str):
    data = do_get("/allTimeLeaderboard/search", {"platform": platform, "clubName": query})
    entries = data if isinstance(data, list) else data.get("clubs", data.get("data", []))
    if isinstance(entries, dict):
        entries = [entries]
    
    results = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        club_info = entry.get("clubInfo") if isinstance(entry.get("clubInfo"), dict) else {}
        name = str(entry.get("clubName", club_info.get("name", entry.get("name", ""))))
        club_id = str(entry.get("clubId", club_info.get("clubId", entry.get("club_id", entry.get("id", "")))))
        if not name or not club_id:
            continue
        
        custom_kit = club_info.get("customKit") if isinstance(club_info.get("customKit"), dict) else {}
        crest_asset_id = custom_kit.get("crestAssetId")
        team_id = club_info.get("teamId")
        
        results.append({
            "clubId": club_id,
            "name": name,
            "currentDivision": str(entry.get("currentDivision", "")),
            "wins": int(entry.get("wins", 0)),
            "losses": int(entry.get("losses", 0)),
            "ties": int(entry.get("ties", 0)),
            "gamesPlayed": int(entry.get("gamesPlayed", 0)),
            "teamId": team_id,
            "crestAssetId": str(crest_asset_id) if crest_asset_id is not None else None,
            "crestUrl": get_crest_url(team_id, crest_asset_id),
        })
    print(json.dumps(results))

def cmd_matches(platform: str, club_id: str, match_type: str, max_count: str):
    data = do_get(
        "/clubs/matches",
        {
            "platform": platform,
            "clubIds": club_id,
            "matchType": match_type,
            "maxResultCount": str(max_count or 10),
        }
    )
    print(json.dumps(data if isinstance(data, list) else []))

def cmd_club_info(platform: str, club_id: str):
    data = do_get("/clubs/info", {"platform": platform, "clubIds": club_id})
    print(json.dumps(data if isinstance(data, dict) else {}))

def cmd_overall_stats(platform: str, club_id: str):
    data = do_get("/clubs/overallStats", {"platform": platform, "clubIds": club_id})
    print(json.dumps(data if isinstance(data, list) else []))

def cmd_member_stats(platform: str, club_id: str):
    data = do_get("/members/stats", {"platform": platform, "clubId": club_id})
    print(json.dumps(data if isinstance(data, dict) else {}))

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command specified"}))
        sys.exit(1)
        
    cmd = sys.argv[1]
    try:
        if cmd == "search":
            platform = sys.argv[2] if len(sys.argv) > 2 else "common-gen5"
            query = sys.argv[3] if len(sys.argv) > 3 else ""
            cmd_search(platform, query)
        elif cmd == "matches":
            platform = sys.argv[2] if len(sys.argv) > 2 else "common-gen5"
            club_id = sys.argv[3] if len(sys.argv) > 3 else ""
            match_type = sys.argv[4] if len(sys.argv) > 4 else "leagueMatch"
            count = sys.argv[5] if len(sys.argv) > 5 else "10"
            cmd_matches(platform, club_id, match_type, count)
        elif cmd == "club_info":
            platform = sys.argv[2] if len(sys.argv) > 2 else "common-gen5"
            club_id = sys.argv[3] if len(sys.argv) > 3 else ""
            cmd_club_info(platform, club_id)
        elif cmd == "overall_stats":
            platform = sys.argv[2] if len(sys.argv) > 2 else "common-gen5"
            club_id = sys.argv[3] if len(sys.argv) > 3 else ""
            cmd_overall_stats(platform, club_id)
        elif cmd == "member_stats":
            platform = sys.argv[2] if len(sys.argv) > 2 else "common-gen5"
            club_id = sys.argv[3] if len(sys.argv) > 3 else ""
            cmd_member_stats(platform, club_id)
        else:
            print(json.dumps({"error": f"Unknown command: {cmd}"}))
            sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
