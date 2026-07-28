from io import BytesIO
from pathlib import Path
import re

from PIL import Image, ImageDraw, ImageFont

from app.lineup_formations import FORMATIONS

BASE_WIDTH = 900
BASE_HEIGHT = 1400
BASE_HEADER_HEIGHT = 176


def _safe_color(value: str, fallback: str) -> str:
    return value if re.fullmatch(r"#[0-9a-fA-F]{6}", str(value or "")) else fallback


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in ("arial.ttf", "seguiemj.ttf", "segoeui.ttf"):
        try:
            return ImageFont.truetype(candidate, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def _scaled(value: float, scale: float, minimum: int = 1) -> int:
    return max(minimum, int(round(value * scale)))


def _fit_font(draw: ImageDraw.ImageDraw, text: str, max_width: int, start: int = 28, minimum: int = 13) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    size = start
    while size > minimum:
        font = _font(size)
        if draw.textlength(text, font=font) <= max_width:
            return font
        size -= 1
    return _font(minimum)


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


def _draw_pitch(draw: ImageDraw.ImageDraw, pitch_color: str, width: int, height: int, header_height: int, scale: float) -> None:
    draw.rectangle((0, 0, width, height), fill="#040404")
    draw.rectangle((0, header_height, width, height), fill=pitch_color)

    stripe_h = int((height - (header_height + _scaled(50, scale))) / 11)
    for index in range(11):
        if index % 2 == 0:
            top = int(header_height + index * stripe_h)
            bottom = int(top + stripe_h)
            draw.rectangle((0, top, width, bottom), fill="#267b09")

    margin = _scaled(70, scale)
    top = header_height + _scaled(55, scale)
    bottom = height - _scaled(55, scale)
    centre = (top + bottom) / 2
    line_width = _scaled(5, scale)

    draw.rectangle((margin, top, width - margin, bottom), outline="#ffffff", width=line_width)
    draw.line((margin, centre, width - margin, centre), fill="#ffffff", width=line_width)
    centre_radius = _scaled(90, scale)
    draw.ellipse((width / 2 - centre_radius, centre - centre_radius, width / 2 + centre_radius, centre + centre_radius), outline="#ffffff", width=line_width)
    dot_radius = _scaled(5, scale)
    draw.ellipse((width / 2 - dot_radius, centre - dot_radius, width / 2 + dot_radius, centre + dot_radius), fill="#ffffff")

    penalty_width = _scaled(460, scale)
    penalty_height = _scaled(190, scale)
    left = (width - penalty_width) / 2
    draw.rectangle((left, top, left + penalty_width, top + penalty_height), outline="#ffffff", width=line_width)
    draw.rectangle((left, bottom - penalty_height, left + penalty_width, bottom), outline="#ffffff", width=line_width)


def _draw_formation_pill(draw: ImageDraw.ImageDraw, formation_label: str, primary: str, width: int, scale: float) -> tuple[int, int]:
    font = _font(_scaled(34, scale))
    text_width = draw.textlength(formation_label, font=font)
    pill_width = max(_scaled(128, scale), int(text_width + _scaled(56, scale)))
    x = width - pill_width - _scaled(40, scale)
    y = _scaled(34, scale)
    pill_height = _scaled(58, scale)

    draw.rounded_rectangle((x, y, x + pill_width, y + pill_height), radius=_scaled(18, scale), fill="#121212", outline=primary, width=_scaled(2, scale))
    draw.text((x + pill_width / 2, y + pill_height / 2 + 1), formation_label, fill=primary, font=font, anchor="mm")
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


def _draw_header_row(draw: ImageDraw.ImageDraw, text: str, flag: str, x: int, y: int, scale: float) -> None:
    flag_w = _scaled(28, scale)
    flag_h = _scaled(18, scale)
    _draw_flag(draw, flag, x, y - int(flag_h / 2), flag_w, flag_h)
    font = _font(_scaled(24, scale))
    draw.text((x + flag_w + _scaled(12, scale), y), text, fill="#d9d9d9", font=font, anchor="lm")


def _draw_header(
    draw: ImageDraw.ImageDraw,
    image: Image.Image,
    title: str,
    formation_label: str,
    kickoff_text: str,
    primary: str,
    width: int,
    header_height: int,
    scale: float,
    kickoff_rows: list[dict[str, str]] | None = None,
) -> None:
    draw.rectangle((0, 0, width, header_height), fill="#050505")
    bar_h = _scaled(8, scale)
    draw.rectangle((0, header_height - bar_h, width, header_height), fill=primary)

    title_x = _scaled(40, scale)
    logo = _load_logo()
    if logo is not None:
        logo_size = _scaled(72, scale)
        resized_logo = logo.resize((logo_size, logo_size))
        image.paste(resized_logo, (title_x, _scaled(34, scale)), resized_logo)
        title_x = _scaled(132, scale)

    pill_x, _ = _draw_formation_pill(draw, formation_label, primary, width, scale)
    title_max = max(_scaled(260, scale), pill_x - title_x - _scaled(24, scale))
    title_font = _fit_font(draw, title, title_max, start=_scaled(56, scale), minimum=_scaled(26, scale))
    draw.text((title_x, _scaled(64, scale)), title, fill="#ffffff", font=title_font, anchor="lm")

    rows = kickoff_rows or []
    first = rows[0] if len(rows) > 0 else {"flag": "ro", "text": kickoff_text or "Kickoff pending"}
    second = rows[1] if len(rows) > 1 else {"flag": "uk", "text": kickoff_text or "Kickoff pending"}
    _draw_header_row(draw, str(first.get("text") or "Kickoff pending"), str(first.get("flag") or "ro"), title_x, _scaled(108, scale), scale)
    _draw_header_row(draw, str(second.get("text") or "Kickoff pending"), str(second.get("flag") or "uk"), title_x, _scaled(142, scale), scale)


def _draw_shirt(draw: ImageDraw.ImageDraw, x: int, y: int, primary: str, secondary: str, number_color: str, number: int, scale: float) -> None:
    top_y = y - _scaled(16, scale)
    sleeve_bottom_y = y + _scaled(28, scale)
    body_half = _scaled(31, scale)
    sleeve_outer_top = _scaled(54, scale)
    sleeve_outer_bottom = _scaled(48, scale)
    sleeve_inner = _scaled(34, scale)

    left_sleeve = [(x - body_half, top_y), (x - sleeve_outer_top, y - 5), (x - sleeve_outer_bottom, sleeve_bottom_y), (x - sleeve_inner, y + 18), (x - body_half, y + 8)]
    right_sleeve = [(x + body_half, top_y), (x + sleeve_outer_top, y - 5), (x + sleeve_outer_bottom, sleeve_bottom_y), (x + sleeve_inner, y + 18), (x + body_half, y + 8)]
    body = [
        (x - body_half, top_y),
        (x - 12, top_y),
        (x, y - 7),
        (x + 12, top_y),
        (x + body_half, top_y),
        (x + body_half, y + _scaled(84, scale)),
        (x + _scaled(16, scale), y + _scaled(100, scale)),
        (x - _scaled(16, scale), y + _scaled(100, scale)),
        (x - body_half, y + _scaled(84, scale)),
    ]

    for polygon in (left_sleeve, right_sleeve, body):
        draw.polygon(polygon, fill=primary, outline=secondary)

    draw.arc((x - _scaled(15, scale), top_y - _scaled(4, scale), x + _scaled(15, scale), top_y + _scaled(20, scale)), start=200, end=-20, fill=secondary, width=_scaled(2, scale))
    num_font = _font(_scaled(34, scale))
    draw.text((x, y + _scaled(44, scale)), str(number), fill=number_color, font=num_font, anchor="mm")


def _draw_position_tag(draw: ImageDraw.ImageDraw, x: int, y: int, position: str, scale: float) -> None:
    font = _font(_scaled(19, scale))
    width = max(_scaled(58, scale), int(draw.textlength(position, font=font) + _scaled(24, scale)))
    height = _scaled(32, scale)
    draw.rounded_rectangle((x - width / 2, y, x + width / 2, y + height), radius=_scaled(11, scale), fill="#EAE905")
    draw.text((x, y + height / 2 + 1), position, fill="#111111", font=font, anchor="mm")


def _draw_player(draw: ImageDraw.ImageDraw, x: int, y: int, position_label: str, player_name: str, index: int, primary: str, secondary: str, scale: float) -> None:
    number_color = _contrast_text(primary)
    _draw_shirt(draw, x, y, primary, secondary, number_color, index + 1, scale)

    display_name = player_name[:22]
    name_max_width = _scaled(190, scale)
    font = _fit_font(draw, display_name, name_max_width, start=_scaled(30, scale), minimum=_scaled(16, scale))
    measured = draw.textlength(display_name, font=font)
    plate_width = max(_scaled(120, scale), min(_scaled(204, scale), int(measured + _scaled(34, scale))))
    plate_height = _scaled(40, scale)
    plate_y = y + _scaled(82, scale)

    draw.rounded_rectangle((x - plate_width / 2, plate_y, x + plate_width / 2, plate_y + plate_height), radius=_scaled(12, scale), fill="#0b0b0b", outline="#252525", width=max(1, _scaled(1, scale)))
    draw.text((x, plate_y + plate_height / 2 + 1), display_name, fill="#ffffff", font=font, anchor="mm")
    _draw_position_tag(draw, x, plate_y + plate_height + _scaled(8, scale), position_label, scale)


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
    del show_slot_tags

    width = max(900, int(width or BASE_WIDTH))
    height = max(1400, int(height or BASE_HEIGHT))
    scale = min(width / BASE_WIDTH, height / BASE_HEIGHT)
    text_scale = scale * 1.35
    header_height = _scaled(BASE_HEADER_HEIGHT, scale)

    layout = FORMATIONS.get(formation)
    if layout is None:
        raise ValueError(f"Unknown formation: {formation}")

    primary = _safe_color(primary_color, "#EAE905")
    secondary = _safe_color(secondary_color, "#0A0A0A")
    pitch = "#2f8a0d"

    image = Image.new("RGB", (width, height), "#000000")
    draw = ImageDraw.Draw(image)

    _draw_pitch(draw, pitch, width, height, header_height, scale)
    _draw_header(
        draw,
        image,
        title or "RYVL Match Lineup",
        layout.label,
        kickoff_text,
        primary,
        width,
        header_height,
        text_scale,
        kickoff_rows=kickoff_rows,
    )

    for index, position in enumerate(layout.positions):
        x0, y0 = layout.coords[position.key]
        x = int(round(x0 * (width / BASE_WIDTH)))
        y = int(round(y0 * (height / BASE_HEIGHT)))
        display = players.get(position.key, position.label)
        _draw_player(draw, x, y + _scaled(108, scale), position.label, display, index, primary, secondary, text_scale)

    buf = BytesIO()
    image.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()
