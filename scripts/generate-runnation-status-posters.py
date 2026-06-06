from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
import random

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "marketing" / "whatsapp-status"
LOGO = ROOT / "assets" / "images" / "adaptive-icon-fill.png"

W, H = 1080, 1920
NAVY = (0, 28, 41)
NAVY2 = (2, 44, 70)
ORANGE = (255, 92, 46)
ORANGE2 = (232, 77, 16)
GOLD = (255, 184, 28)
BLUE = (37, 99, 235)
PURPLE = (124, 58, 237)
GREEN = (16, 185, 129)
WHITE = (255, 255, 255)
MUTED = (226, 232, 240)
INK = (17, 24, 39)


def font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


F = {
    "brand": font(54, True),
    "kicker": font(30, True),
    "headline": font(86, True),
    "headline_small": font(72, True),
    "body": font(38, True),
    "body_regular": font(34, False),
    "small": font(27, True),
    "button": font(34, True),
}


def gradient_bg(top, bottom):
    img = Image.new("RGB", (W, H), top)
    pix = img.load()
    for y in range(H):
        t = y / (H - 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        for x in range(W):
            pix[x, y] = (r, g, b)
    return img


def add_noise(img, opacity=18):
    noise = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    p = noise.load()
    rng = random.Random(7)
    for _ in range(18000):
        x = rng.randrange(W)
        y = rng.randrange(H)
        a = rng.randrange(opacity)
        p[x, y] = (255, 255, 255, a)
    img.alpha_composite(noise)


def rounded_rect(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def fit_text(draw, text, max_width, base_size, bold=True, min_size=44):
    size = base_size
    while size >= min_size:
        f = font(size, bold)
        lines = wrap_text(draw, text, f, max_width)
        if len(lines) <= 4:
            return f, lines
        size -= 4
    f = font(min_size, bold)
    return f, wrap_text(draw, text, f, max_width)


def wrap_text(draw, text, fnt, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=fnt)[2] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_wrapped(draw, text, xy, fnt, fill, max_width, line_gap=10, align="left"):
    x, y = xy
    lines = wrap_text(draw, text, fnt, max_width)
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=fnt)
        line_w = bbox[2] - bbox[0]
        tx = x if align == "left" else x + (max_width - line_w) / 2
        draw.text((tx, y), line, font=fnt, fill=fill)
        y += (bbox[3] - bbox[1]) + line_gap
    return y


def load_logo(size=230):
    logo = Image.open(LOGO).convert("RGBA")
    logo.thumbnail((size, size), Image.Resampling.LANCZOS)
    return logo


def paste_logo(img, x, y, size=230):
    logo = load_logo(size)
    shadow = Image.new("RGBA", (logo.width + 36, logo.height + 36), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    rounded_rect(sd, (18, 18, logo.width + 18, logo.height + 18), 34, (0, 0, 0, 95))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    img.alpha_composite(shadow, (x - 18, y - 18))
    img.alpha_composite(logo, (x, y))


def draw_running_lines(draw, color=(255, 184, 28, 75)):
    for i in range(8):
        y = 360 + i * 155
        points = []
        for x in range(-120, W + 180, 40):
            yy = y + math.sin((x + i * 70) / 90) * 28
            points.append((x, yy))
        draw.line(points, fill=color, width=5)


def draw_footer(draw, text="Download link on my status"):
    rounded_rect(draw, (94, 1658, W - 94, 1748), 45, ORANGE)
    tw = draw.textbbox((0, 0), text, font=F["button"])
    draw.text(((W - (tw[2] - tw[0])) / 2, 1680), text, font=F["button"], fill=WHITE)
    tag = "RunNation - Where runners belong"
    tb = draw.textbbox((0, 0), tag, font=F["small"])
    draw.text(((W - (tb[2] - tb[0])) / 2, 1788), tag, font=F["small"], fill=MUTED)


def base_dark():
    img = gradient_bg(NAVY, (7, 55, 89)).convert("RGBA")
    add_noise(img, 24)
    draw = ImageDraw.Draw(img, "RGBA")
    draw_running_lines(draw)
    draw.ellipse((620, -120, 1230, 500), fill=(255, 92, 46, 35))
    draw.ellipse((-260, 1150, 520, 2050), fill=(255, 184, 28, 25))
    return img, draw


def base_orange():
    img = gradient_bg((255, 88, 40), (222, 119, 0)).convert("RGBA")
    add_noise(img, 16)
    draw = ImageDraw.Draw(img, "RGBA")
    draw.ellipse((610, -160, 1230, 520), fill=(0, 28, 41, 45))
    draw.ellipse((-250, 1260, 520, 2100), fill=(0, 28, 41, 32))
    return img, draw


POSTERS = [
    {
        "file": "01_where_runners_belong.png",
        "bg": "orange",
        "kicker": "YOU ARE INVITED",
        "headline": "Join a home built for runners.",
        "body": "RunNation brings sports enthusiasts, athletes, walkers, and goal-chasers into one community.",
        "chips": ["Download APK", "Try the app", "Join the movement"],
    },
    {
        "file": "02_every_run_counts.png",
        "bg": "orange",
        "kicker": "FOR GOAL-DRIVEN PEOPLE",
        "headline": "Turn your running goal into a visible journey.",
        "body": "Whether you are starting, returning, training, or competing, RunNation helps you stay accountable.",
        "chips": ["Running goals", "Progress", "Consistency"],
    },
    {
        "file": "03_find_your_club.png",
        "bg": "mixed",
        "kicker": "SPORT FEELS BETTER TOGETHER",
        "headline": "Find your club. Meet your people.",
        "body": "Connect with running clubs, discover events, and keep moving with people who share your energy.",
        "chips": ["Clubs", "Events", "Community"],
    },
    {
        "file": "04_events_and_medals.png",
        "bg": "orange",
        "kicker": "READY FOR YOUR NEXT CHALLENGE?",
        "headline": "From 3K to Ultra, there is a race for you.",
        "body": "Find events, register, chase medals, and share your running story with a growing sports community.",
        "chips": ["3K", "5K", "10K", "21K", "42K+"],
    },
    {
        "file": "05_goals_support.png",
        "bg": "mixed",
        "kicker": "FOR ATHLETES AND EVERYDAY MOVERS",
        "headline": "Your pace is personal. Your progress should be visible.",
        "body": "Use RunNation to follow goals, track activities, compare leaderboards, and stay inspired.",
        "chips": ["Athletes", "Walkers", "Runners", "Fitness"],
    },
    {
        "file": "06_download_invite.png",
        "bg": "orange",
        "kicker": "TRY RUNNATION TODAY",
        "headline": "Download it. Test it. Tell me what you think.",
        "body": "If you love sport, run for fitness, train for races, or want a running goal this year, this app is for you.",
        "chips": ["APK link on status", "Try it now", "Feedback welcome"],
    },
]


def base_mixed():
    img = gradient_bg(ORANGE, (230, 104, 0)).convert("RGBA")
    add_noise(img, 16)
    draw = ImageDraw.Draw(img, "RGBA")
    draw.rectangle((0, 0, W, 520), fill=(255, 255, 255, 238))
    draw.ellipse((610, -130, 1230, 500), fill=(37, 99, 235, 210))
    draw.ellipse((-260, 1170, 520, 2100), fill=(16, 185, 129, 200))
    draw.polygon([(W, 720), (W, 1440), (610, 1510), (720, 830)], fill=(124, 58, 237, 180))
    return img, draw


def render_poster(spec):
    if spec["bg"] == "dark":
        img, draw = base_dark()
    elif spec["bg"] == "mixed":
        img, draw = base_mixed()
    else:
        img, draw = base_orange()
    text_color = WHITE
    if spec["bg"] == "mixed":
        header_text = INK
        header_muted = (75, 85, 99)
        kicker_color = PURPLE
        chip_fill = BLUE
    else:
        header_text = WHITE
        header_muted = MUTED if spec["bg"] == "dark" else (255, 248, 235)
        kicker_color = GOLD if spec["bg"] == "dark" else NAVY
        chip_fill = ORANGE if spec["bg"] == "dark" else NAVY
    muted = MUTED if spec["bg"] == "dark" else (255, 248, 235)
    dark_card = (255, 255, 255, 245) if spec["bg"] in ("orange", "mixed") else (4, 54, 78, 245)
    card_text = INK if spec["bg"] in ("orange", "mixed") else WHITE
    card_muted = (75, 85, 99) if spec["bg"] in ("orange", "mixed") else MUTED

    paste_logo(img, 72, 88, 210)
    draw.text((306, 118), "RunNation", font=F["brand"], fill=header_text)
    draw.text((310, 178), "Where runners belong", font=F["small"], fill=header_muted)

    content_top = 560 if spec["bg"] == "mixed" else 378
    draw.text((78, content_top), spec["kicker"], font=F["kicker"], fill=kicker_color)
    headline_base = 76 if spec["bg"] == "mixed" else 88
    headline_min = 52 if spec["bg"] == "mixed" else 62
    headline_font, headline_lines = fit_text(draw, spec["headline"], W - 156, headline_base, True, headline_min)
    y = content_top + 52
    for line in headline_lines:
        draw.text((78, y), line, font=headline_font, fill=text_color)
        y += draw.textbbox((0, 0), line, font=headline_font)[3] + 18

    y += 28
    y = draw_wrapped(draw, spec["body"], (82, y), F["body_regular"], muted, W - 164, 14)

    chip_x, chip_y = 82, y + 46
    for chip in spec["chips"]:
        tw = draw.textbbox((0, 0), chip, font=F["small"])
        chip_w = tw[2] - tw[0] + 46
        if chip_x + chip_w > W - 82:
            chip_x = 82
            chip_y += 62
        rounded_rect(draw, (chip_x, chip_y, chip_x + chip_w, chip_y + 46), 23, chip_fill)
        draw.text((chip_x + 23, chip_y + 10), chip, font=F["small"], fill=WHITE)
        chip_x += chip_w + 14

    card_top = 1240 if spec["bg"] == "mixed" else 1120
    card_bottom = 1558
    rounded_rect(draw, (72, card_top, W - 72, card_bottom), 34, dark_card, outline=(255, 255, 255, 65), width=2)
    mini = [
        ("For users", "clubs, events, goals, medals"),
        ("For clubs", "members, management, payments"),
        ("For organizers", "publicity, signups, leaderboards"),
    ]
    yy = card_top + 34
    for title, desc in mini:
        accent = ORANGE if spec["bg"] == "dark" else (GREEN if title == "For users" else BLUE if title == "For clubs" else PURPLE)
        rounded_rect(draw, (112, yy, 154, yy + 42), 21, accent)
        draw.text((180, yy - 2), title, font=F["body"], fill=card_text)
        draw.text((180, yy + 42), desc, font=F["body_regular"], fill=card_muted)
        yy += 88 if spec["bg"] == "mixed" else 122

    draw_footer(draw)
    img.save(OUT / spec["file"])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for poster in POSTERS:
        render_poster(poster)
    print(f"Generated {len(POSTERS)} posters in {OUT}")


if __name__ == "__main__":
    main()
