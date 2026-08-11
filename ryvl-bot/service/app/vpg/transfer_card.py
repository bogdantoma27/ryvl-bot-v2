from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

from app.render_utils import fetch_remote_image


WIDTH, HEIGHT = 1200, 520


def _font(size: int, bold: bool = False):
    names = ("DejaVuSans-Bold.ttf", "arialbd.ttf") if bold else ("DejaVuSans.ttf", "arial.ttf")
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _image(url: str | None, size: tuple[int, int]) -> Image.Image | None:
    if not url:
        return None
    try:
        image = fetch_remote_image(url)
        if image is None:
            return None
        image.thumbnail(size)
        canvas = Image.new("RGBA", size, "#111827")
        canvas.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
        return canvas
    except Exception:
        return None


def _fit_label(draw: ImageDraw.ImageDraw, value: str, max_width: int, size: int = 20):
    font = _font(size, True)
    while len(value) > 3 and draw.textlength(value, font=font) > max_width:
        value = value[:-4] + "..."
    return value, font


def render_transfer_card_png(
    *,
    username: str,
    from_name: str | None,
    to_name: str,
    avatar_url: str | None,
    from_logo_url: str | None,
    to_logo_url: str | None,
    league_logo_url: str | None,
    community_name: str,
) -> bytes:
    image = Image.new("RGB", (WIDTH, HEIGHT), "#07111f")
    draw = ImageDraw.Draw(image)
    for x in range(WIDTH):
        color = (7 + int(12 * x / WIDTH), 17 + int(18 * x / WIDTH), 31 + int(25 * x / WIDTH))
        draw.line((x, 0, x, HEIGHT), fill=color)
    draw.rectangle((0, 0, WIDTH, 7), fill="#dba51d")
    draw.text((50, 34), "TRANSFER UPDATE", fill="#dba51d", font=_font(22, True))
    draw.text((50, 70), username, fill="#ffffff", font=_font(34, True))

    cards = [(70, 150, username), (470, 150, from_name or "FREE AGENT"), (870, 150, to_name)]
    for left, top, label in cards:
        draw.rounded_rectangle((left, top, left + 260, top + 230), radius=14, fill="#0e1929", outline="#31425c", width=2)
        draw.rounded_rectangle((left + 18, top + 18, left + 242, top + 178), radius=10, fill="#101c30")
        label, label_font = _fit_label(draw, label, 220)
        draw.text((left + 20, top + 190), label, fill="#ffffff", font=label_font)

    player = _image(avatar_url, (150, 150))
    if player:
        image.paste(player, (125, 155), player)
    else:
        initials = "".join(part[0] for part in username.split() if part)[:2].upper() or "?"
        draw.text((200, 225), initials, fill="#dba51d", font=_font(42, True), anchor="mm")
    origin = _image(from_logo_url, (130, 130))
    if origin:
        image.paste(origin, (535, 165), origin)
    else:
        draw.text((545, 220), "FREE", fill="#dba51d", font=_font(28, True))
        draw.text((545, 255), "AGENT", fill="#dba51d", font=_font(28, True))
    destination = _image(to_logo_url, (130, 130))
    if destination:
        image.paste(destination, (935, 165), destination)
    else:
        initials = "".join(part[0] for part in to_name.split() if part)[:3].upper() or "?"
        draw.text((1000, 225), initials, fill="#dba51d", font=_font(34, True), anchor="mm")

    draw.text((355, 245), ">>>", fill="#dba51d", font=_font(36, True))
    draw.text((755, 245), ">>>", fill="#dba51d", font=_font(36, True))
    community = _image(league_logo_url, (70, 70))
    if community:
        image.paste(community, (1060, 420), community)
    draw.text((50, 465), "powered by @bgd7x", fill="#94a3b8", font=_font(16))

    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()