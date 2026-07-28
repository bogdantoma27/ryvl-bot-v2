from io import BytesIO
from pathlib import Path
import re

from PIL import Image, ImageDraw, ImageFont

from app.lineup_formations import FORMATIONS

WIDTH = 900
HEIGHT = 1400
HEADER_HEIGHT = 176


def _safe_color(value: str, fallback: str) -> str:
    return value if re.fullmatch(r"#[0-9a-fA-F]{6}", str(value or "")) else fallback


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    bold_candidates = (
        "DejaVuSans-Bold.ttf",
        "Arial Bold.ttf",
        "arialbd.ttf",
        "segoeuib.ttf",
    )
    regular_candidates = (
        "DejaVuSans.ttf",
        "Arial.ttf",
        "arial.ttf",
        "segoeui.ttf",
    )
    candidates = bold_candidates if bold else regular_candidates
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def _fit_font(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_width: int,
    start: int = 28,
    minimum: int = 13,
    bold: bool = True,
) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    size = start
    while size > minimum:
        font = _font(size, bold=bold)
        if draw.textlength(text, font=font) <= max_width:
            return font
        size -= 1
    return _font(minimum, bold=bold)


def _contrast_text(hex_color: str) -> str:
    raw = _safe_color(hex_color, "#ffffff").replace("#", "")
    r = int(raw[0:2], 16)
    g = int(raw[2:4], 16)
    b = int(raw[4:6], 16)
    brightness = (r * 299 + g * 587 + b * 114) / 1000
    return "#111111" if brightness > 150 else "#ffffff"


def _load_logo() -> Image.Image | None:
    logo_path = Path(__file__).resolve().parents[3] / "ryvl" / "assets" / "brand" / "ryvl-logo.png"
    if not logo_path.exists():
        return None
    try:
        return Image.open(logo_path).convert("RGBA")
    except Exception:
        return None


def _draw_pitch(draw: ImageDraw.ImageDraw, pitch_color: str) -> None:
    draw.rectangle((0, 0, WIDTH, HEIGHT), fill="#040404")
    draw.rectangle((0, HEADER_HEIGHT, WIDTH, HEIGHT), fill=pitch_color)

    stripe_h = (HEIGHT - (HEADER_HEIGHT + 50)) / 11
    for index in range(11):
        if index % 2 == 0:
            top = int(HEADER_HEIGHT + index * stripe_h)
            draw.rectangle((0, top, WIDTH, int(top + stripe_h)), fill="#267b09")

    margin = 70
    top = HEADER_HEIGHT + 55
    bottom = HEIGHT - 55
    centre = (top + bottom) / 2

    draw.rectangle((margin, top, WIDTH - margin, bottom), outline="#ffffff", width=5)
    draw.line((margin, centre, WIDTH - margin, centre), fill="#ffffff", width=5)
    draw.ellipse((WIDTH / 2 - 90, centre - 90, WIDTH / 2 + 90, centre + 90), outline="#ffffff", width=5)
    draw.ellipse((WIDTH / 2 - 5, centre - 5, WIDTH / 2 + 5, centre + 5), fill="#ffffff")

    penalty_width = 460
    penalty_height = 190
    left = (WIDTH - penalty_width) / 2
    draw.rectangle((left, top, left + penalty_width, top + penalty_height), outline="#ffffff", width=5)
    draw.rectangle((left, bottom - penalty_height, left + penalty_width, bottom), outline="#ffffff", width=5)


def _draw_formation_pill(draw: ImageDraw.ImageDraw, formation_label: str, primary: str) -> tuple[int, int]:
    font = _font(26, bold=True)
    text_width = draw.textlength(formation_label, font=font)
    pill_width = max(128, int(text_width + 40))
    x = WIDTH - pill_width - 40
    y = 38

    draw.rounded_rectangle((x, y, x + pill_width, y + 52), radius=18, fill="#121212", outline=primary, width=2)
    draw.text((x + pill_width / 2, y + 27), formation_label, fill=primary, font=font, anchor="mm")
    return x, pill_width


def _draw_romanian_flag(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, height: int) -> None:
    stripe = width / 3
    draw.rectangle((x, y, x + stripe, y + height), fill="#002B7F")
    draw.rectangle((x + stripe, y, x + stripe * 2, y + height), fill="#FCD116")
    draw.rectangle((x + stripe * 2, y, x + width, y + height), fill="#CE1126")
    draw.rectangle((x, y, x + width, y + height), outline="#b5b5b5", width=1)


def _draw_uk_flag(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, height: int) -> None:
    draw.rectangle((x, y, x + width, y + height), fill="#012169")

    draw.line((x, y, x + width, y + height), fill="#ffffff", width=6)
    draw.line((x + width, y, x, y + height), fill="#ffffff", width=6)
    draw.line((x, y, x + width, y + height), fill="#C8102E", width=3)
    draw.line((x + width, y, x, y + height), fill="#C8102E", width=3)

    draw.rectangle((x + width / 2 - 4, y, x + width / 2 + 4, y + height), fill="#ffffff")
    draw.rectangle((x, y + height / 2 - 4, x + width, y + height / 2 + 4), fill="#ffffff")
    draw.rectangle((x + width / 2 - 2.5, y, x + width / 2 + 2.5, y + height), fill="#C8102E")
    draw.rectangle((x, y + height / 2 - 2.5, x + width, y + height / 2 + 2.5), fill="#C8102E")
    draw.rectangle((x, y, x + width, y + height), outline="#b5b5b5", width=1)


def _draw_flag(draw: ImageDraw.ImageDraw, code: str, x: int, y: int, width: int, height: int) -> None:
    if code == "ro":
        _draw_romanian_flag(draw, x, y, width, height)
        return
    if code == "uk":
        _draw_uk_flag(draw, x, y, width, height)
        return
    draw.rectangle((x, y, x + width, y + height), fill="#444444")


def _draw_header_row(draw: ImageDraw.ImageDraw, text: str, flag: str, x: int, y: int) -> None:
    flag_w = 24
    flag_h = 16
    _draw_flag(draw, flag, x, y - 12, flag_w, flag_h)
    font = _font(18, bold=True)
    draw.text((x + flag_w + 12, y - 1), text, fill="#d9d9d9", font=font, anchor="lm")


def _draw_header(
    draw: ImageDraw.ImageDraw,
    image: Image.Image,
    title: str,
    formation_label: str,
    kickoff_text: str,
    primary: str,
    kickoff_rows: list[dict[str, str]] | None = None,
) -> None:
    draw.rectangle((0, 0, WIDTH, HEADER_HEIGHT), fill="#050505")
    draw.rectangle((0, HEADER_HEIGHT - 8, WIDTH, HEADER_HEIGHT), fill=primary)

    title_x = 40
    logo = _load_logo()
    if logo is not None:
        resized_logo = logo.resize((72, 72))
        image.paste(resized_logo, (40, 34), resized_logo)
        title_x = 132

    pill_x, _ = _draw_formation_pill(draw, formation_label, primary)
    title_max = max(260, pill_x - title_x - 24)
    title_font = _fit_font(draw, title, title_max, start=46, minimum=22, bold=True)
    draw.text((title_x, 62), title, fill="#ffffff", font=title_font, anchor="lm")

    rows = kickoff_rows or []
    first = rows[0] if len(rows) > 0 else {"flag": "ro", "text": kickoff_text or "Kickoff pending"}
    second = rows[1] if len(rows) > 1 else {"flag": "uk", "text": kickoff_text or "Kickoff pending"}
    _draw_header_row(draw, str(first.get("text") or "Kickoff pending"), str(first.get("flag") or "ro"), title_x, 100)
    _draw_header_row(draw, str(second.get("text") or "Kickoff pending"), str(second.get("flag") or "uk"), title_x, 130)


def _draw_shirt(draw: ImageDraw.ImageDraw, x: int, y: int, primary: str, secondary: str, number_color: str, number: int) -> None:
    top_y = y - 13
    sleeve_bottom_y = y + 23
    body_half = 27
    sleeve_outer_top = 48
    sleeve_outer_bottom = 43
    sleeve_inner = 30

    left_sleeve = [
        (x - body_half, top_y),
        (x - sleeve_outer_top, y - 5),
        (x - sleeve_outer_bottom, sleeve_bottom_y),
        (x - sleeve_inner, y + 18),
        (x - body_half, y + 8),
    ]
    right_sleeve = [
        (x + body_half, top_y),
        (x + sleeve_outer_top, y - 5),
        (x + sleeve_outer_bottom, sleeve_bottom_y),
        (x + sleeve_inner, y + 18),
        (x + body_half, y + 8),
    ]
    body = [
        (x - body_half, top_y),
        (x - 12, top_y),
        (x, y - 7),
        (x + 12, top_y),
        (x + body_half, top_y),
        (x + body_half, y + 74),
        (x + 14, y + 88),
        (x - 14, y + 88),
        (x - body_half, y + 74),
    ]

    for polygon in (left_sleeve, right_sleeve, body):
        draw.polygon(polygon, fill=primary, outline=secondary)

    draw.arc((x - 15, top_y - 4, x + 15, top_y + 20), start=200, end=-20, fill=secondary, width=2)
    num_font = _font(24, bold=True)
    draw.text((x, y + 36), str(number), fill=number_color, font=num_font, anchor="mm")


def _draw_position_tag(draw: ImageDraw.ImageDraw, x: int, y: int, position: str) -> None:
    font = _font(15, bold=True)
    width = max(46, int(draw.textlength(position, font=font) + 20))
    draw.rounded_rectangle((x - width / 2, y, x + width / 2, y + 26), radius=10, fill="#EAE905")
    draw.text((x, y + 13), position, fill="#111111", font=font, anchor="mm")


def _draw_player(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    position_label: str,
    player_name: str,
    index: int,
    primary: str,
    secondary: str,
    show_slot_tags: bool,
) -> None:
    number_color = _contrast_text(primary)
    _draw_shirt(draw, x, y, primary, secondary, number_color, index + 1)

    display_name = player_name[:22]
    font = _fit_font(draw, display_name, 164, start=24, minimum=14, bold=True)
    measured = draw.textlength(display_name, font=font)
    plate_width = max(104, min(164, int(measured + 26)))
    plate_height = 34
    plate_y = y + 66

    draw.rounded_rectangle((x - plate_width / 2, plate_y, x + plate_width / 2, plate_y + plate_height), radius=12, fill="#0b0b0b", outline="#252525", width=1)
    draw.text((x, plate_y + plate_height / 2 + 1), display_name, fill="#ffffff", font=font, anchor="mm")
    if show_slot_tags:
        _draw_position_tag(draw, x, plate_y + plate_height + 8, position_label)


def render_lineup_png(
    *,
    formation: str,
    players: dict[str, str],
    title: str,
    kickoff_text: str = "",
    kickoff_rows: list[dict[str, str]] | None = None,
    primary_color: str = "#EAE905",
    secondary_color: str = "#111111",
    width: int = 900,
    height: int = 1400,
    show_slot_tags: bool = True,
) -> bytes:
    layout = FORMATIONS.get(formation)
    if layout is None:
        raise ValueError(f"Unknown formation: {formation}")

    primary = _safe_color(primary_color, "#EAE905")
    secondary = _safe_color(secondary_color, "#0A0A0A")
    pitch = "#2f8a0d"

    image = Image.new("RGB", (WIDTH, HEIGHT), "#000000")
    draw = ImageDraw.Draw(image)

    _draw_pitch(draw, pitch)
    _draw_header(
        draw,
        image,
        title or "RYVL Match Lineup",
        layout.label,
        kickoff_text,
        primary,
        kickoff_rows=kickoff_rows,
    )

    for index, position in enumerate(layout.positions):
        x, y = layout.coords[position.key]
        display = players.get(position.key, position.label)
        _draw_player(draw, x, y + 108, position.label, display, index, primary, secondary, show_slot_tags)

    target_width = max(900, int(width or WIDTH))
    target_height = max(1400, int(height or HEIGHT))
    if target_width != WIDTH or target_height != HEIGHT:
        # Keep the original aspect ratio to avoid horizontal/vertical stretching.
        ratio = min(target_width / WIDTH, target_height / HEIGHT)
        resized = image.resize((int(WIDTH * ratio), int(HEIGHT * ratio)), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (target_width, target_height), "#000000")
        offset_x = (target_width - resized.width) // 2
        offset_y = (target_height - resized.height) // 2
        canvas.paste(resized, (offset_x, offset_y))
        image = canvas

    buf = BytesIO()
    image.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()
