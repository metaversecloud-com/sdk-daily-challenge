"""Tiny vector-style renderer used to draw the Word Hunt badge pictures.

Coordinates are written in a 1024x1024 space. Everything is drawn at 2x and downsampled, so edges stay smooth.
Each shape gets the same treatment as the game UI's tiles: a thick dark outline, a flat-ish gradient fill,
a soft top-left rim light and a bottom-right shade, so the pictures read as part of the same family.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

SS = 2
N = 1024 * SS
OUT = (16, 30, 54)  # outline: very dark navy (the game's navy, darker)

CREAM = ((255, 251, 244), (240, 228, 212))
YELLOW = ((252, 232, 130), (240, 196, 62))
GOLD = ((255, 226, 96), (224, 150, 24))
SILVER = ((240, 245, 252), (146, 164, 188))
BRONZE = ((236, 160, 96), (160, 88, 40))
ORANGE = ((255, 150, 60), (230, 70, 40))
BLUE = ((110, 205, 245), (36, 100, 190))
GREEN = ((110, 210, 100), (40, 150, 70))
WOOD = ((196, 124, 66), (126, 70, 34))
DARKWOOD = ((110, 62, 32), (70, 38, 20))
RED = ((255, 110, 110), (190, 36, 56))
WHITE = ((255, 255, 255), (232, 240, 250))

YY, XX = np.mgrid[0:N, 0:N].astype(np.float32)


def S(v):
    return v * SS


def mk(fn):
    im = Image.new("L", (N, N), 0)
    fn(ImageDraw.Draw(im))
    return np.asarray(im, np.float32) / 255.0


def pts(p):
    return [(S(x), S(y)) for x, y in p]


def rr(x0, y0, x1, y1, r):
    return mk(lambda d: d.rounded_rectangle([S(x0), S(y0), S(x1), S(y1)], S(r), fill=255))


def el(x0, y0, x1, y1):
    return mk(lambda d: d.ellipse([S(x0), S(y0), S(x1), S(y1)], fill=255))


def circ(cx, cy, r):
    return el(cx - r, cy - r, cx + r, cy + r)


def pg(p):
    return mk(lambda d: d.polygon(pts(p), fill=255))


def spline(p, closed=True, per=14):
    """Catmull-Rom spline through the points (closed loop by default) -> list of points."""
    n = len(p)
    out = []
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0, p1, p2, p3 = (
            p[(i - 1) % n] if closed or i > 0 else p[0],
            p[i],
            p[(i + 1) % n],
            p[(i + 2) % n] if closed or i + 2 < n else p[-1],
        )
        for t in np.linspace(0, 1, per, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(
                tuple(
                    0.5
                    * (
                        2 * p1[k]
                        + (-p0[k] + p2[k]) * t
                        + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                        + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3
                    )
                    for k in (0, 1)
                )
            )
    return out


def blob(p):
    return pg(spline(p))


def rot(mask_fn, cx, cy, w, h, angle):
    """Draw a w x h shape (via mask_fn(draw, x, y, W, H)) rotated by `angle` degrees CCW around (cx, cy)."""
    W, H = int(S(w)), int(S(h))
    pad = int(math.hypot(W, H)) + 8
    tmp = Image.new("L", (pad, pad), 0)
    mask_fn(ImageDraw.Draw(tmp), (pad - W) // 2, (pad - H) // 2, W, H)
    tmp = tmp.rotate(angle, resample=Image.BICUBIC)
    full = Image.new("L", (N, N), 0)
    full.paste(tmp, (int(S(cx)) - pad // 2, int(S(cy)) - pad // 2))
    return np.asarray(full, np.float32) / 255.0


def rot_rr(cx, cy, w, h, r, angle):
    return rot(lambda d, x, y, W, H: d.rounded_rectangle([x, y, x + W, y + H], S(r), fill=255), cx, cy, w, h, angle)


def rot_el(cx, cy, w, h, angle):
    return rot(lambda d, x, y, W, H: d.ellipse([x, y, x + W, y + H], fill=255), cx, cy, w, h, angle)


def union(*m):
    return np.maximum.reduce(m)


def sub(a, b):
    return np.clip(a - b, 0, 1)


def inter(a, b):
    return a * b


def blur(m, r):
    return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(S(r))), np.float32) / 255.0


def star_pts(cx, cy, R, r, n=5, rot_deg=-90):
    out = []
    for i in range(2 * n):
        a = math.radians(rot_deg + i * 180 / n)
        rad = R if i % 2 == 0 else r
        out.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return out


class Canvas:
    def __init__(self):
        self.p = np.zeros((N, N, 3), np.float32)  # premultiplied colour
        self.a = np.zeros((N, N), np.float32)

    def paint(self, mask, rgb, alpha=1.0):
        m = mask * alpha
        if isinstance(rgb, tuple):
            rgb = np.array(rgb, np.float32)[None, None, :]
        self.p = self.p * (1 - m[..., None]) + rgb * m[..., None]
        self.a = self.a * (1 - m) + m

    def part(self, mask, colors, ow=13, bevel=True, k=9, outline=True, shade=True):
        """Outlined, gradient-filled, rim-lit shape."""
        if outline and ow:
            near = ndi.distance_transform_edt(mask < 0.5) <= S(ow)
            self.paint(near.astype(np.float32), OUT)
        top, bot = (np.array(c, np.float32) for c in colors)
        ys = np.where(mask.max(axis=1) > 0.5)[0]
        y0, y1 = ys.min(), ys.max()
        t = np.clip((YY - y0) / max(1, y1 - y0), 0, 1)[..., None]
        rgb = top * (1 - t) + bot * t
        self.paint(mask, rgb)
        if bevel:
            kk = S(k)
            hi = blur(np.clip(mask - np.roll(mask, (kk, kk), (0, 1)), 0, 1) * mask, 2.5)
            lo = blur(np.clip(mask - np.roll(mask, (-kk, -kk), (0, 1)), 0, 1) * mask, 2.5)
            self.paint(hi * mask, (255, 255, 255), 0.6)
            if shade:
                self.paint(lo * mask, (0, 0, 20), 0.22)

    def flat(self, mask, rgb, alpha=1.0):
        self.paint(mask, rgb, alpha)

    def line(self, p, width, rgb, alpha=1.0):
        def f(d):
            q = pts(p)
            d.line(q, fill=255, width=int(S(width)), joint="curve")
            for x, y in q:
                d.ellipse([x - S(width) / 2, y - S(width) / 2, x + S(width) / 2, y + S(width) / 2], fill=255)

        self.paint(mk(f), rgb, alpha)

    def paste(self, other, clip):
        """Composite another canvas onto this one, clipped to `clip` (0..1 mask)."""
        m = other.a * clip
        self.p = self.p * (1 - m[..., None]) + other.p * clip[..., None]
        self.a = self.a * (1 - m) + m

    def save(self, path):
        a = np.clip(self.a, 0, 1)
        rgb = np.where(a[..., None] > 1e-4, self.p / np.maximum(a[..., None], 1e-4), 0)
        im = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
        Image.fromarray(im, "RGBA").resize((1024, 1024), Image.LANCZOS).save(path)


# ---------- reusable pieces ----------


def tile(cv, cx, cy, size, colors=CREAM, angle=0):
    h = size / 2
    m = rot_rr(cx, cy, size, size, size * 0.17, angle) if angle else rr(cx - h, cy - h, cx + h, cy + h, size * 0.17)
    cv.part(m, colors, ow=max(9, size * 0.055))
    return m


def sparkle(cv, cx, cy, R, colors=WHITE):
    cv.part(pg(star_pts(cx, cy, R, R * 0.28, n=4, rot_deg=-90)), colors, ow=0, bevel=False)


def star(cv, cx, cy, R, colors=YELLOW, ow=11):
    cv.part(pg(star_pts(cx, cy, R, R * 0.46)), colors, ow=ow)


def glow(cv, cx, cy, R, rgb=(255, 232, 130), alpha=0.55):
    d = np.sqrt((XX - S(cx)) ** 2 + (YY - S(cy)) ** 2) / S(R)
    cv.paint(np.clip(1 - d, 0, 1) ** 1.6, rgb, alpha)


def rays(cv, cx, cy, R, n=12, rgb=(255, 232, 130), alpha=0.35):
    for i in range(n):
        a0 = math.radians(i * 360 / n)
        a1 = a0 + math.radians(360 / n / 2)
        cv.paint(pg([(cx, cy), (cx + R * math.cos(a0), cy + R * math.sin(a0)), (cx + R * math.cos(a1), cy + R * math.sin(a1))]), rgb, alpha)
