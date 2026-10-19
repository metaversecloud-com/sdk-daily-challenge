"""Draws the 12 Word Hunt badge pictures (unframed, transparent, 1024px).

Usage: python3 draw_subjects.py OUT_DIR [slug ...]
Pictures use the game's own parts (letter tiles, yellow "selected" tiles, the navy tile path) and its palette.
No letters or numerals anywhere, per the Topia badge spec.
"""
import math
import os
import sys

from lib import *  # noqa: F401,F403


# ---------- 1. 7-Day Streak: a flame ----------
def streak():
    cv = Canvas()
    glow(cv, 512, 560, 430, (255, 150, 60), 0.35)
    outer = blob([(512, 40), (600, 200), (720, 330), (820, 520), (800, 740), (668, 920), (512, 975), (356, 920), (224, 740), (204, 520), (300, 370), (350, 470), (410, 300), (450, 160)])
    cv.part(outer, ORANGE, ow=15)
    mid = blob([(520, 330), (600, 450), (690, 590), (672, 760), (580, 880), (512, 905), (444, 880), (352, 760), (338, 600), (410, 520), (450, 590), (470, 460)])
    cv.part(mid, ((255, 205, 80), (255, 140, 40)), ow=0)
    core = blob([(512, 590), (572, 690), (600, 790), (550, 868), (512, 880), (474, 868), (424, 790), (452, 690)])
    cv.part(core, ((255, 250, 205), (255, 224, 110)), ow=0)
    sparkle(cv, 800, 190, 52, YELLOW)
    sparkle(cv, 215, 300, 36, YELLOW)
    return cv


# ---------- 2-4. Hunter ladder: a magnifier over letter tiles ----------
def magnifier(cv, cx, cy, r, ring, handle, content=None):
    u = (math.cos(math.radians(45)), math.sin(math.radians(45)))
    hl = r * 1.05
    hx, hy = cx + u[0] * (r + hl / 2 - r * 0.08), cy + u[1] * (r + hl / 2 - r * 0.08)
    cv.part(rot_rr(hx, hy, hl, r * 0.36, r * 0.16, -45), handle, ow=13)
    cap = rot_rr(cx + u[0] * (r + hl - r * 0.02), cy + u[1] * (r + hl - r * 0.02), r * 0.3, r * 0.5, r * 0.12, -45)
    cv.part(cap, ring, ow=12)
    lens = circ(cx, cy, r * 0.8)
    cv.part(lens, ((120, 190, 238), (60, 128, 200)), ow=0, bevel=False)
    if content:
        inner = Canvas()
        content(inner, cx, cy, r)
        cv.paste(inner, lens)
    ringm = sub(circ(cx, cy, r), circ(cx, cy, r * 0.8))
    cv.part(ringm, ring, ow=13)
    cv.paint(sub(circ(cx, cy, r * 0.8 + 0.1), circ(cx, cy, r * 0.8 - 7)), OUT, 0.9)
    # glass glint
    arc = sub(circ(cx, cy, r * 0.68), circ(cx, cy, r * 0.6))
    quarter = pg([(cx - r, cy - r), (cx, cy - r), (cx - r * 0.1, cy), (cx - r, cy + r * 0.1)])
    cv.paint(inter(arc, quarter), (255, 255, 255), 0.8)


def amateur():
    cv = Canvas()

    def content(c, cx, cy, r):
        tile(c, cx, cy, r * 1.0, CREAM, -6)

    magnifier(cv, 450, 450, 330, BRONZE, DARKWOOD, content)
    sparkle(cv, 870, 150, 50, YELLOW)
    return cv


def novice():
    cv = Canvas()

    def content(c, cx, cy, r):
        pos = [(cx - 0.4 * r, cy - 0.34 * r), (cx + 0.08 * r, cy + 0.04 * r), (cx + 0.44 * r, cy - 0.3 * r)]
        for (x, y), col in zip(pos, [CREAM, YELLOW, CREAM]):
            tile(c, x, y, r * 0.5, col)

    magnifier(cv, 450, 450, 350, SILVER, DARKWOOD, content)
    sparkle(cv, 880, 140, 56, YELLOW)
    sparkle(cv, 140, 800, 40, WHITE)
    return cv


def seasoned():
    cv = Canvas()
    glow(cv, 450, 450, 520, (255, 232, 130), 0.4)
    rays(cv, 450, 450, 470, 14, alpha=0.28)

    def content(c, cx, cy, r):
        for dx in (-0.33, 0.33):
            for dy in (-0.33, 0.33):
                tile(c, cx + dx * r, cy + dy * r, r * 0.54, YELLOW)

    magnifier(cv, 450, 450, 360, GOLD, DARKWOOD, content)
    star(cv, 850, 140, 80, YELLOW)
    sparkle(cv, 140, 820, 46, WHITE)
    sparkle(cv, 930, 520, 36, YELLOW)
    return cv


# ---------- 5-8. Score ladder: a trophy that grows each tier ----------
def wing(cv, x, y, flip):
    s = -1 if flip else 1
    for i, (dx, dy, w, h, a) in enumerate([(0, 0, 330, 120, 28), (-30, 70, 290, 110, 12), (-50, 135, 240, 100, -4)]):
        cv.part(rot_el(x + s * dx, y + dy, w, h, s * a * -1), WHITE, ow=11, shade=False)


def trophy(cv, metal, size_star=True, wings=False, ribbon=False):
    if wings:
        wing(cv, 215, 300, True)
        wing(cv, 809, 300, False)
    # handles
    for cx in (258, 766):
        ring = sub(el(cx - 92, 250, cx + 92, 440), el(cx - 56, 288, cx + 56, 402))
        cv.part(ring, metal, ow=12)
    # bowl
    bowl = inter(el(262, 70, 762, 640), rr(0, 235, 1024, 700, 0))
    cv.part(bowl, metal, ow=14)
    rim = rr(236, 205, 788, 290, 30)
    cv.part(rim, tuple(tuple(min(255, c + 22) for c in col) for col in metal), ow=13)
    # stem + base
    cv.part(pg([(458, 600), (566, 600), (588, 720), (436, 720)]), metal, ow=12)
    cv.part(rr(330, 705, 694, 800, 22), metal, ow=13)
    cv.part(rr(380, 800, 644, 880, 18), DARKWOOD if metal is BRONZE else ((70, 90, 140), (36, 52, 96)), ow=12)
    if size_star:
        star(cv, 512, 440, 110, YELLOW if metal is not GOLD else ((255, 252, 220), (255, 232, 130)))


def score5():
    cv = Canvas()
    trophy(cv, BRONZE, size_star=False)
    return cv


def score10():
    cv = Canvas()
    trophy(cv, SILVER)
    sparkle(cv, 860, 190, 48, WHITE)
    return cv


def score15():
    cv = Canvas()
    glow(cv, 512, 480, 520, (255, 232, 130), 0.4)
    rays(cv, 512, 480, 500, 16, alpha=0.3)
    trophy(cv, GOLD)
    sparkle(cv, 870, 140, 58, YELLOW)
    sparkle(cv, 150, 190, 40, WHITE)
    return cv


def score20():
    cv = Canvas()
    glow(cv, 512, 480, 560, (255, 220, 110), 0.5)
    rays(cv, 512, 480, 520, 20, alpha=0.32)
    trophy(cv, GOLD, wings=True)
    # gem on the base
    cv.part(circ(512, 840, 30), RED, ow=9)
    sparkle(cv, 900, 110, 64, YELLOW)
    sparkle(cv, 120, 120, 46, WHITE)
    sparkle(cv, 900, 800, 40, WHITE)
    return cv


# ---------- 9. 100K total: a treasure chest overflowing with tiles and coins ----------
def chest():
    cv = Canvas()
    glow(cv, 512, 430, 560, (255, 224, 110), 0.55)
    rays(cv, 512, 430, 500, 14, alpha=0.25)
    # open lid (back)
    cv.part(pg([(240, 520), (784, 520), (730, 300), (294, 300)]), DARKWOOD, ow=14)
    cv.part(pg([(240, 520), (784, 520), (770, 480), (254, 480)]), ((60, 34, 22), (40, 22, 14)), ow=0, bevel=False)
    # treasure heap
    for cx, cy in [(330, 430), (450, 390), (600, 380), (700, 440), (390, 480), (640, 490), (520, 440)]:
        cv.part(el(cx - 80, cy - 50, cx + 80, cy + 50), GOLD, ow=10)
        cv.part(sub(el(cx - 52, cy - 32, cx + 52, cy + 32), el(cx - 40, cy - 22, cx + 40, cy + 22)), ((255, 205, 60), (214, 130, 20)), ow=0, bevel=False)
    tile(cv, 380, 360, 190, YELLOW, 14)
    tile(cv, 660, 340, 190, CREAM, -16)
    star(cv, 520, 330, 70, ((255, 252, 220), (255, 224, 110)), ow=10)
    # body
    cv.part(rr(190, 500, 834, 880, 40), WOOD, ow=15)
    for x in (330, 512, 694):
        cv.flat(rr(x - 3, 520, x + 3, 860, 0), (60, 34, 20), 0.35)
    for x0 in (190, 744):
        cv.part(rr(x0, 500, x0 + 90, 880, 18), GOLD, ow=12)
    cv.part(rr(190, 500, 834, 560, 24), GOLD, ow=12)
    cv.part(rr(452, 570, 572, 700, 24), ((255, 252, 220), (255, 214, 90)), ow=12)
    cv.part(circ(512, 625, 20), DARKWOOD, ow=6, bevel=False)
    cv.part(rr(504, 625, 520, 672, 6), DARKWOOD, ow=0, bevel=False)
    sparkle(cv, 870, 250, 60, YELLOW)
    sparkle(cv, 160, 280, 44, WHITE)
    return cv


# ---------- 10. Found "Topia": a little planet ----------
def topia():
    cv = Canvas()
    cx, cy, R = 512, 520, 300
    ang = 24
    ring_full = sub(rot_el(cx, cy, 960, 300, ang), rot_el(cx, cy, 700, 190, ang))
    half = rot(lambda d, x, y, W, H: d.rectangle([x, y + H // 2, x + W, y + H], fill=255), cx, cy, 1200, 700, ang)
    ring_front = inter(ring_full, half)
    ring_back = sub(ring_full, ring_front)
    cv.part(ring_back, YELLOW, ow=13)
    sphere = circ(cx, cy, R)
    cv.part(sphere, ((120, 220, 250), (30, 90, 185)), ow=15, bevel=False)
    # continents
    land1 = inter(sphere, blob([(300, 380), (400, 330), (470, 380), (450, 470), (370, 540), (310, 480)]))
    land2 = inter(sphere, blob([(560, 560), (660, 500), (750, 560), (730, 660), (640, 760), (560, 700)]))
    land3 = inter(sphere, blob([(520, 260), (610, 250), (650, 320), (580, 370), (520, 340)]))
    for land in (land1, land2, land3):
        cv.part(land, GREEN, ow=7, bevel=False)
    # clouds
    for x, y, w in [(360, 640, 150), (610, 400, 120)]:
        c = inter(sphere, union(el(x - w / 2, y - 26, x + w / 2, y + 26), el(x - w / 4, y - 44, x + w / 4, y + 10)))
        cv.paint(c, (255, 255, 255), 0.85)
    # sphere light / shade
    d = np.sqrt((XX - S(cx - 90)) ** 2 + (YY - S(cy - 100)) ** 2) / S(R * 1.5)
    cv.paint(sphere * np.clip(1 - d, 0, 1) ** 2, (255, 255, 255), 0.45)
    edge = np.clip(np.sqrt((XX - S(cx)) ** 2 + (YY - S(cy)) ** 2) / S(R), 0, 1) ** 4
    cv.paint(sphere * edge, (10, 20, 70), 0.35)
    cv.part(ring_front, YELLOW, ow=13)
    star(cv, 850, 190, 74, YELLOW)
    sparkle(cv, 160, 200, 44, WHITE)
    return cv


# ---------- 11. 7+ letter word: a long path across the board ----------
def longword():
    cv = Canvas()
    size, gap = 232, 36
    x0 = (1024 - (3 * size + 2 * gap)) / 2
    c = lambda col, row: (x0 + size / 2 + col * (size + gap), 120 + size / 2 + row * (size + gap))
    path = [(0, 0), (1, 0), (2, 0), (2, 1), (1, 1), (0, 1), (0, 2)]
    for row in range(3):
        for col in range(3):
            x, y = c(col, row)
            tile(cv, x, y, size, YELLOW if (col, row) in path else CREAM)
    cv.line([c(*p) for p in path], 30, OUT, 0.95)
    for p in (path[0], path[-1]):
        x, y = c(*p)
        cv.paint(circ(x, y, 34), OUT, 1.0)
    star(cv, 880, 140, 86, ((255, 252, 220), (255, 214, 90)))
    sparkle(cv, 130, 880, 46, WHITE)
    return cv


# ---------- 12. CROWN! ----------
def crown():
    cv = Canvas()
    glow(cv, 512, 480, 560, (255, 224, 110), 0.55)
    rays(cv, 512, 500, 520, 18, alpha=0.3)
    body = pg([(250, 700), (210, 280), (380, 470), (512, 220), (644, 470), (814, 280), (774, 700)])
    cv.part(body, GOLD, ow=16)
    # velvet band
    cv.part(rr(240, 650, 784, 760, 26), RED, ow=14)
    cv.part(rr(240, 640, 784, 690, 22), ((255, 240, 150), (240, 180, 50)), ow=12)
    # tip pearls
    for x, y in [(210, 258), (512, 196), (814, 258)]:
        cv.part(circ(x, y, 46), ((255, 255, 255), (214, 228, 245)), ow=11)
    # jewels
    cv.part(circ(512, 520, 52), ((120, 220, 255), (30, 100, 200)), ow=11)
    cv.part(circ(390, 580, 34), RED, ow=9)
    cv.part(circ(634, 580, 34), RED, ow=9)
    sparkle(cv, 160, 760, 44, WHITE)
    sparkle(cv, 880, 150, 64, YELLOW)
    sparkle(cv, 870, 780, 40, WHITE)
    return cv


BADGES = {
    "streak-7-day": streak,
    "amateur-hunter": amateur,
    "novice-hunter": novice,
    "seasoned-hunter": seasoned,
    "score-5k": score5,
    "score-10k": score10,
    "score-15k": score15,
    "score-20k": score20,
    "score-100k-total": chest,
    "found-topia": topia,
    "long-word": longword,
    "crown": crown,
}

if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    wanted = sys.argv[2:] or list(BADGES)
    for slug in wanted:
        path = os.path.join(out, f"wordhunt-badge-{slug}-subject-v001.png")
        BADGES[slug]().save(path)
        print(path, flush=True)
