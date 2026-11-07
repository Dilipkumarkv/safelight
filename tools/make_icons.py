#!/usr/bin/env python3
"""Generate the Safelight app icons (no Pillow needed).

Concept: an amber safelight lamp glowing in a dark room — a filled disc with a
dark aperture at its centre, a soft halo, and a whisper of film grain.
"""
import os
import struct
import zlib


def png_write(path, width, height, rows):
    def chunk(tag, data):
        out = struct.pack(">I", len(data)) + tag + data
        return out + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + bytes(row) for row in rows)
    blob = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as fh:
        fh.write(blob)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(lerp(c1[i], c2[i], t) for i in range(3))


def clamp01(v):
    return 0.0 if v < 0.0 else 1.0 if v > 1.0 else v


INK_TOP = (0x18, 0x1A, 0x20)
INK_BOT = (0x07, 0x08, 0x0A)
AMBER = (0xF0, 0xB3, 0x57)
AMBER_LIGHT = (0xFF, 0xD9, 0xA0)
AMBER_DEEP = (0xB4, 0x6C, 0x1C)
PAPER = (0xF7, 0xF1, 0xE4)
HOLE = (0x0A, 0x0B, 0x0E)


def shade(u, v, scale, idx):
    """u, v in [0,1] across the icon. scale shrinks content for maskable safe zone."""
    bg = mix(INK_TOP, INK_BOT, v ** 0.9)
    dx, dy = u - 0.5, v - 0.5
    d = (dx * dx + dy * dy) ** 0.5

    # Halo around the lamp.
    halo = clamp01(1.0 - d / (0.46 * scale)) ** 3.2
    col = mix(bg, AMBER, halo * 0.30)

    r_disc = 0.268 * scale
    r_hole = 0.080 * scale

    # A warm rim just outside the disc reads as spilled light.
    rim = clamp01(1.0 - abs(d - (r_disc + 0.018 * scale)) / (0.026 * scale))
    col = mix(col, AMBER, rim * 0.14)

    if d <= r_disc:
        k = (d / r_disc) ** 1.4
        disc = mix(AMBER_LIGHT, AMBER_DEEP, k)
        # Gentle top-left highlight so it reads as a lamp, not a flat circle.
        hl = clamp01(1.0 - (((u - 0.44) ** 2 + (v - 0.40) ** 2) ** 0.5) / (0.30 * scale))
        disc = mix(disc, PAPER, hl * 0.22)
        col = disc

    if d <= r_hole:
        edge = clamp01((r_hole - d) / (0.012 * scale))
        col = mix(col, HOLE, edge)

    # Film grain.
    n = ((idx * 7919) % 997) / 997.0 - 0.5
    col = tuple(max(0, min(255, c + n * 5.0)) for c in col)
    return col


def render(size, scale, ss=3):
    big = size * ss
    rows = []
    for y in range(size):
        acc = [[0.0, 0.0, 0.0] for _ in range(size)]
        for sy in range(ss):
            yy = y * ss + sy
            v = (yy + 0.5) / big
            for x in range(big):
                u = (x + 0.5) / big
                c = shade(u, v, scale, (yy + 1) * (x + 7))
                a = acc[x // ss]
                a[0] += c[0]
                a[1] += c[1]
                a[2] += c[2]
        denom = float(ss * ss)
        rows.append([int(round(ch / denom)) for px in acc for ch in px])
    return rows


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "icons")
    os.makedirs(out, exist_ok=True)
    report = []

    jobs = [
        ("icon-192.png", 192, 1.0),
        ("icon-512.png", 512, 1.0),
        ("icon-maskable-512.png", 512, 0.72),  # keep art inside the mask safe zone
        ("apple-touch-icon.png", 180, 1.0),
    ]
    for name, size, scale in jobs:
        rows = render(size, scale)
        path = os.path.join(out, name)
        png_write(path, size, size, rows)
        report.append(f"{name}: {os.path.getsize(path)} bytes")

    # Never print: this runs under a harness whose stdout can be a closed pipe.
    with open(os.path.join(here, "..", "build-icons.log"), "w") as fh:
        fh.write("\n".join(report) + "\n")


if __name__ == "__main__":
    main()
