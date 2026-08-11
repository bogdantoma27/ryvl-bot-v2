from dataclasses import dataclass
from datetime import datetime
from typing import Any


def _first(raw: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = raw.get(key)
        if value is not None and value != "":
            return value
    return None


@dataclass(frozen=True)
class VpgMatch:
    id: int
    match_day: str | None
    home_name: str
    home_logo: str | None
    home_id: int | None
    away_name: str
    away_logo: str | None
    away_id: int | None
    home_score: int | None
    away_score: int | None
    datetime: datetime | str | None


@dataclass(frozen=True)
class VpgStandingRow:
    position: int
    team_name: str
    team_abbr: str
    team_logo: str | None
    played: int
    wins: int
    draws: int
    losses: int
    score_for: int
    score_against: int
    goal_difference: int
    points: int


@dataclass(frozen=True)
class VpgMovement:
    id: int
    datetime: datetime | str | None
    username: str
    from_name: str | None
    from_slug: str | None
    from_logo: str | None
    to_name: str | None
    to_slug: str | None
    to_logo: str | None
    amount: float | None


def normalise_match(raw: dict[str, Any], index: int = 0) -> VpgMatch:
    return VpgMatch(
        id=int(_first(raw, "id", "match_id") or index),
        match_day=_first(raw, "match_day", "matchday", "round"),
        home_name=str(_first(raw, "home_name", "home_team_name") or "Home"),
        home_logo=_first(raw, "home_logo", "home_team_logo"),
        home_id=_first(raw, "home_id", "home_team_id"),
        away_name=str(_first(raw, "away_name", "away_team_name") or "Away"),
        away_logo=_first(raw, "away_logo", "away_team_logo"),
        away_id=_first(raw, "away_id", "away_team_id"),
        home_score=_first(raw, "home_score", "home_team_score"),
        away_score=_first(raw, "away_score", "away_team_score"),
        datetime=_first(raw, "datetime", "date", "scheduled_at"),
    )


def normalise_standings(raw: dict[str, Any], index: int = 0) -> VpgStandingRow:
    score_for = int(_first(raw, "score_for", "goals_for", "gf") or 0)
    score_against = int(_first(raw, "score_against", "goals_against", "ga") or 0)
    # VPG's table endpoint returns rows pre-sorted by rank but omits a position field.
    position = _first(raw, "position", "rank")
    return VpgStandingRow(
        position=int(position) if position is not None else index + 1,
        team_name=str(_first(raw, "team_name", "name") or ""),
        team_abbr=str(_first(raw, "team_abbr", "abbreviation") or ""),
        team_logo=_first(raw, "team_logo", "logo", "logo_id"),
        played=int(_first(raw, "played", "games", "matches_played") or 0),
        wins=int(_first(raw, "wins", "win") or 0),
        draws=int(_first(raw, "draws", "draw") or 0),
        losses=int(_first(raw, "losses", "loss") or 0),
        score_for=score_for,
        score_against=score_against,
        goal_difference=int(_first(raw, "goal_difference", "goal_diff", "gd") or score_for - score_against),
        points=int(_first(raw, "points", "pts") or 0),
    )


def normalise_movement(raw: dict[str, Any]) -> VpgMovement:
    return VpgMovement(
        id=int(raw.get("id") or 0),
        datetime=raw.get("datetime"),
        username=str(raw.get("username") or ""),
        from_name=raw.get("from_name"),
        from_slug=raw.get("from_slug"),
        from_logo=raw.get("from_logo"),
        to_name=raw.get("to_name"),
        to_slug=raw.get("to_slug"),
        to_logo=raw.get("to_logo"),
        amount=float(raw["amount"]) if raw.get("amount") is not None else None,
    )