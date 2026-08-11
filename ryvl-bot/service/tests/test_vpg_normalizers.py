from app.vpg.normalizers import normalise_match, normalise_standings


def test_normalise_match_accepts_team_name_variants():
    match = normalise_match({"id": 4, "home_team_name": "A", "away_name": "B"})
    assert match.home_name == "A"
    assert match.away_name == "B"


def test_normalise_standings_computes_goal_difference():
    row = normalise_standings({"position": 1, "team_name": "A", "goals_for": 10, "goals_against": 4})
    assert row.goal_difference == 6