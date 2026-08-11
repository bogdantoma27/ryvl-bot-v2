from __future__ import annotations

from datetime import datetime
from io import BytesIO

from PIL import Image, ImageDraw

from app.render_utils import fetch_remote_image, font as _font
from app.vpg.normalizers import VpgMatch, VpgStandingRow

WIDTH = 1400
ROW_HEIGHT = 76


def _text(draw: ImageDraw.ImageDraw, value: object, xy: tuple[int, int], size: int = 22, *, bold: bool = False, fill: str = "#f8fafc", anchor: str | None = None) -> None:
    draw.text(xy, str(value), fill=fill, font=_font(size, bold), anchor=anchor)


def _round_label(match_day: str | None) -> str:
    if not match_day:
        return "Match"
    text = str(match_day).strip()
    return f"Round {text}" if text.isdigit() else text


def _format_datetime(value: datetime | str | None) -> str:
    if not value:
        return "Date pending"
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value[:20]
    return value.strftime("%b %d, %H:%M")


def _finish(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _logo(image: Image.Image, url: str | None, box: tuple[int, int, int, int]) -> None:
    if not url:
        return
    logo = fetch_remote_image(url)
    if logo is None:
        return
    left, top, right, bottom = box
    logo.thumbnail((right - left, bottom - top))
    image.paste(logo, (left + (right - left - logo.width) // 2, top + (bottom - top - logo.height) // 2), logo)


def render_standings_png(
    league_name: str,
    season: int | None,
    rows: list[VpgStandingRow],
    logo_urls: dict[str, str | None] | None = None,
) -> bytes:
    height = max(360, 190 + ROW_HEIGHT * max(1, len(rows)))
    image = Image.new("RGB", (WIDTH, height), "#07090e")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, WIDTH, 8), fill="#dba51d")
    _text(draw, league_name, (44, 34), 42, bold=True)
    _text(draw, f"Standings  |  Season {season or '-'}", (46, 94), 22, fill="#a5afc1")

    columns = [(58, "#", "m"), (180, "TEAM", "l"), (760, "MP", "m"), (850, "W", "m"), (930, "D", "m"), (1010, "L", "m"), (1090, "GD", "m"), (1200, "PTS", "m")]
    for x, label, align in columns:
        _text(draw, label, (x, 145), 16, bold=True, fill="#7f8ba1", anchor=f"{align}a")
    for index, row in enumerate(rows):
        top = 178 + index * ROW_HEIGHT
        center = top + (ROW_HEIGHT - 6) // 2
        fill = "#0e1118" if index % 2 == 0 else "#0b0e14"
        draw.rounded_rectangle((34, top, WIDTH - 34, top + ROW_HEIGHT - 6), radius=8, fill=fill, outline="#1c2235")
        _text(draw, row.position, (58, center), 23, bold=True, fill="#dba51d", anchor="mm")
        _logo(image, (logo_urls or {}).get(row.team_name), (120, top + 8, 168, top + 62))
        _text(draw, row.team_name, (180, center), 22, bold=True, anchor="lm")
        for x, value in ((760, row.played), (850, row.wins), (930, row.draws), (1010, row.losses), (1090, row.goal_difference), (1200, row.points)):
            _text(draw, value, (x, center), 21, fill="#dce3ef", anchor="mm")
    return _finish(image)


def render_matches_png(
    league_name: str,
    season: int | None,
    matches: list[VpgMatch],
    mode: str,
    logo_urls: dict[str, str | None] | None = None,
) -> bytes:
    height = max(360, 170 + ROW_HEIGHT * max(1, len(matches)))
    image = Image.new("RGB", (WIDTH, height), "#07090e")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, WIDTH, 8), fill="#dba51d")
    _text(draw, league_name, (44, 34), 42, bold=True)
    _text(draw, f"{'Fixtures' if mode == 'fixtures' else 'Results'}  |  Season {season or '-'}", (46, 94), 22, fill="#a5afc1")
    for index, match in enumerate(matches):
        top = 150 + index * ROW_HEIGHT
        center = top + (ROW_HEIGHT - 6) // 2
        draw.rounded_rectangle((34, top, WIDTH - 34, top + ROW_HEIGHT - 6), radius=8, fill="#0e1118", outline="#1c2235")
        _text(draw, _round_label(match.match_day), (58, top + 16), 14, fill="#7f8ba1", anchor="la")
        _text(draw, _format_datetime(match.datetime), (1342, top + 16), 14, fill="#7f8ba1", anchor="ra")
        _logo(image, (logo_urls or {}).get(match.home_name), (205, top + 8, 253, top + 62))
        _text(draw, match.home_name, (265, center), 23, bold=True, anchor="lm")
        score = f"{match.home_score} : {match.away_score}" if mode == "results" and match.home_score is not None and match.away_score is not None else "VS"
        _text(draw, score, (700, center), 24, bold=True, fill="#dba51d", anchor="mm")
        _text(draw, match.away_name, (1110, center), 23, bold=True, anchor="rm")
        _logo(image, (logo_urls or {}).get(match.away_name), (1120, top + 8, 1172, top + 62))
    return _finish(image)