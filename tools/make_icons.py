"""Generate extension icons (PNG) without third-party dependencies."""

import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "icons")
BG = (59, 125, 216)
FG = (255, 255, 255)
SS = 3  # supersampling factor


def rounded_rect_alpha(x, y, w, h, r):
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    dx, dy = x - cx, y - cy
    d = math.hypot(dx, dy)
    if d <= r:
        return 1.0
    return max(0.0, 1.0 - (d - r))


def inside_rect(x, y, x0, y0, x1, y1):
    return x0 <= x <= x1 and y0 <= y <= y1


def shape_alpha(u, v):
    """Return coverage in [0,1] of the padlock glyph at normalized coords."""
    a = 0.0

    # shackle: upper half ring
    dx, dy = u - 0.5, v - 0.44
    d = math.hypot(dx * 1.15, dy)
    if v <= 0.44 and 0.115 <= d <= 0.20:
        a = 1.0

    # body
    if inside_rect(u, v, 0.27, 0.42, 0.73, 0.80):
        a = 1.0

    # keyhole
    if math.hypot(u - 0.5, v - 0.56) <= 0.045:
        a = 0.0
    if inside_rect(u, v, 0.487, 0.56, 0.513, 0.71):
        a = 0.0

    return a


def render(size):
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            ar, ag, ab, aa = 0, 0, 0, 0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    u, v = x / size, y / size
                    cov = rounded_rect_alpha(x, y, size, size, size * 0.22)
                    if cov <= 0:
                        continue
                    g = shape_alpha(u, v)
                    r = BG[0] + (FG[0] - BG[0]) * g
                    gg = BG[1] + (FG[1] - BG[1]) * g
                    b = BG[2] + (FG[2] - BG[2]) * g
                    ar += r * cov
                    ag += gg * cov
                    ab += b * cov
                    aa += 255 * cov
            n = SS * SS
            row += bytes((int(ar / n), int(ag / n), int(ab / n), int(aa / n)))
        rows.append(bytes(row))
    return rows


def write_png(path, rows):
    size = len(rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    raw = b"".join(b"\x00" + r for r in rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    out = os.path.normpath(OUT_DIR)
    os.makedirs(out, exist_ok=True)
    for size in (16, 48, 128):
        write_png(os.path.join(out, f"icon{size}.png"), render(size))
        print(f"icon{size}.png -> {out}")


if __name__ == "__main__":
    main()
