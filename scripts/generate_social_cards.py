from __future__ import annotations

from pathlib import Path
import textwrap

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SIZE = (1200, 630)

CARDS = [
    {
        "filename": "social-root.png",
        "background": (11, 17, 32),
        "background_end": (23, 37, 84),
        "accent": (56, 189, 248),
        "accent_2": (245, 158, 11),
        "eyebrow": "ROOT DOMAIN HUB",
        "title": "NatsuFox",
        "subtitle": "AI-native agent tools, knowledge workflows, and research systems with clear entry points.",
    },
    {
        "filename": "social-tapestry.png",
        "background": (26, 18, 13),
        "background_end": (124, 45, 18),
        "accent": (253, 186, 116),
        "accent_2": (255, 247, 237),
        "eyebrow": "PROJECT GUIDE",
        "title": "Tapestry",
        "subtitle": "AI-native web knowledge base and content intelligence workflow.",
    },
    {
        "filename": "social-astockit.png",
        "background": (7, 17, 31),
        "background_end": (20, 83, 45),
        "accent": (134, 239, 172),
        "accent_2": (240, 253, 244),
        "eyebrow": "PROJECT GUIDE",
        "title": "A-Stockit",
        "subtitle": "AI-native A-share research and decision workflow.",
    },
]


def load_font(size: int, serif: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if serif else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf" if serif else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_gradient(image: Image.Image, start: tuple[int, int, int], end: tuple[int, int, int]) -> None:
    draw = ImageDraw.Draw(image)
    width, height = image.size
    for y in range(height):
        ratio = y / max(height - 1, 1)
        color = tuple(int(start[i] + (end[i] - start[i]) * ratio) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)


def render_card(config: dict[str, object]) -> None:
    image = Image.new("RGB", SIZE)
    draw_gradient(image, config["background"], config["background_end"])
    draw = ImageDraw.Draw(image)

    panel = (72, 72, 1128, 558)
    draw.rounded_rectangle(panel, radius=34, fill=(15, 23, 42, 214), outline=(71, 85, 105), width=2)

    draw.ellipse((930, 40, 1160, 270), fill=tuple((*config["accent"],)))
    draw.ellipse((40, 420, 300, 680), fill=tuple((*config["accent_2"],)))

    eyebrow_font = load_font(28)
    title_font = load_font(78, serif=True)
    subtitle_font = load_font(33)

    draw.text((110, 138), str(config["eyebrow"]), font=eyebrow_font, fill=config["accent"])
    draw.text((110, 208), str(config["title"]), font=title_font, fill=config["accent_2"])

    subtitle = textwrap.fill(str(config["subtitle"]), width=48)
    draw.multiline_text((110, 320), subtitle, font=subtitle_font, fill=(226, 232, 240), spacing=12)

    image.save(ASSETS / str(config["filename"]), format="PNG")


if __name__ == "__main__":
    ASSETS.mkdir(parents=True, exist_ok=True)
    for card in CARDS:
        render_card(card)
        print(f"Wrote assets/{card['filename']}")
