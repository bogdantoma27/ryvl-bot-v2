import re
from io import BytesIO
from time import monotonic

import httpx
from PIL import Image
from PIL import ImageDraw, ImageFont


_REMOTE_IMAGE_CACHE: dict[str, tuple[float, Image.Image | None]] = {}
_REMOTE_IMAGE_TTL_SECONDS = 300.0


def safe_color(value: str, fallback: str) -> str:
    return value if re.fullmatch(r"#[0-9a-fA-F]{6}", str(value or "")) else fallback


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    bold_candidates = ("DejaVuSans-Bold.ttf", "Arial Bold.ttf", "arialbd.ttf", "segoeuib.ttf")
    regular_candidates = ("DejaVuSans.ttf", "Arial.ttf", "arial.ttf", "segoeui.ttf")
    for candidate in bold_candidates if bold else regular_candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def fit_font(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_width: int,
    start: int = 28,
    minimum: int = 13,
    bold: bool = True,
) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    size = start
    while size > minimum:
        candidate = font(size, bold=bold)
        if draw.textlength(text, font=candidate) <= max_width:
            return candidate
        size -= 1
    return font(minimum, bold=bold)


def contrast_text(hex_color: str) -> str:
    raw = safe_color(hex_color, "#ffffff").replace("#", "")
    r, g, b = int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
    brightness = (r * 299 + g * 587 + b * 114) / 1000
    return "#111111" if brightness > 150 else "#ffffff"


def fetch_remote_image(url: str | None) -> Image.Image | None:
    if not url:
        return None
    cached = _REMOTE_IMAGE_CACHE.get(url)
    if cached and cached[0] > monotonic():
        return cached[1].copy() if cached[1] is not None else None
    try:
        response = httpx.get(url, timeout=10)
        response.raise_for_status()
        image = Image.open(BytesIO(response.content)).convert("RGBA")
    except Exception:
        image = None
    _REMOTE_IMAGE_CACHE[url] = (monotonic() + _REMOTE_IMAGE_TTL_SECONDS, image)
    return image.copy() if image is not None else None