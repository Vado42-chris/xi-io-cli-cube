#!/usr/bin/env python3
"""Shared bounded pixel-quality check for disposable HEX GUI evidence.

A detected process/window and a nonempty PNG do NOT establish visible UI.
This check rejects blank, prepaint, transparent and cursor-only captures. A
nonblank screen is still not proof of semantic UI, clicks or functionality.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
import stat
import sys

MAX_BYTES = 16 * 1024 * 1024
MAX_PIXELS = 4096 * 4096

try:
    from PIL import Image, __version__ as pillow_version
except ImportError:
    print("PNG_DECODER_UNAVAILABLE", file=sys.stderr)
    sys.exit(78)

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def inspect(file):
    file = Path(file)
    st = file.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or
            not 24 <= st.st_size <= MAX_BYTES):
        raise ValueError("PNG_FILE_INVALID_OR_OVER_BUDGET")
    with file.open("rb") as stream:
        raw = stream.read(MAX_BYTES + 1)
    if len(raw) != st.st_size or len(raw) > MAX_BYTES:
        raise ValueError("PNG_FILE_CHANGED_OR_OVER_BUDGET")
    with Image.open(io.BytesIO(raw)) as original:
        w, h = original.size
        if (original.format != "PNG" or getattr(original, "n_frames", 1) != 1 or
                w < 320 or h < 200 or w * h > MAX_PIXELS):
            raise ValueError("PNG_DIMENSIONS_OR_FORMAT_UNQUALIFIED")
        original.verify()
    with Image.open(io.BytesIO(raw)) as opened:
        rgba = opened.convert("RGBA")
        # Hidden RGB values under zero alpha are not visible pixels.
        visible = Image.alpha_composite(
            Image.new("RGBA", rgba.size, (0, 0, 0, 255)), rgba
        ).convert("L")
        histogram = visible.histogram()
    pixels = w * h
    minority = pixels - max(histogram)
    if minority * 200 <= pixels:
        raise ValueError("PNG_BLANK_OR_PREPAINT")
    return {
        "schema": "xiio.hex.capture-nonblank/v1",
        "width": w,
        "height": h,
        "screenshot_sha256": hashlib.sha256(raw).hexdigest(),
        "non_dominant_luma_pixels": minority,
        "capture_scope": "entire-isolated-display",
        "selected_window_pixels_verified": False,
        "semantic_ui_verified": False,
        "decoder": {"pillow": pillow_version, "python": sys.version.split()[0]},
    }


if __name__ == "__main__":
    if sys.argv[1:] == ["--check-decoder"]:
        print("PNG_DECODER_AVAILABLE")
        sys.exit(0)
    if len(sys.argv) != 2:
        print("USAGE: verify-hex-capture.py PNG", file=sys.stderr)
        sys.exit(64)
    try:
        print(json.dumps(inspect(sys.argv[1]), sort_keys=True))
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
