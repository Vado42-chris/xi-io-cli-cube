#!/usr/bin/env python3
"""Hostile capture evidence cases. No host install or privileged access."""
import hashlib
import importlib.util
import os
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("hex_capture", ROOT / "scripts/verify-hex-capture.py")
CAPTURE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CAPTURE)


def paint_fixture_ui(image):
    painter = ImageDraw.Draw(image)
    painter.rectangle((100, 100, 700, 500), fill=(240, 240, 240))
    for i, shade in enumerate((24, 48, 72, 96, 120, 144, 168, 192)):
        painter.rectangle((125, 125 + 33*i, 660, 140 + 33*i),
                          fill=(shade, shade, shade))


class Capture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.file = Path(self.tmp.name) / "capture.png"

    def rejected(self, code=None):
        with self.assertRaises((ValueError, OSError)) as caught:
            CAPTURE.inspect(self.file)
        if code:
            self.assertIn(code, str(caught.exception))

    def image(self, mode="RGB", color="black", size=(800, 600)):
        Image.new(mode, size, color).save(self.file)

    def test_uniform_black_white_gray_red(self):
        for color in ["black", "white", "#222222", "red"]:
            with self.subTest(color=color):
                self.image(color=color)
                self.rejected("PNG_BLANK_OR_PREPAINT")

    def test_single_cursor_not_visible_ui(self):
        self.image()
        with Image.open(self.file) as src:
            picture = src.copy()
        ImageDraw.Draw(picture).rectangle((20, 20, 30, 40), fill="white")
        picture.save(self.file)
        self.rejected("PNG_BLANK_OR_PREPAINT")

    def test_transparent_hidden_color_is_not_visible(self):
        image = Image.new("RGBA", (800, 600), (255, 0, 0, 0))
        ImageDraw.Draw(image).rectangle((50, 50, 700, 500), fill=(0, 255, 0, 0))
        image.save(self.file)
        self.rejected("PNG_BLANK_OR_PREPAINT")

    def test_deliberately_painted_visual_is_observed_not_accepted_semantically(self):
        image = Image.new("RGB", (800, 600), "black")
        paint_fixture_ui(image)
        image.save(self.file)
        result = CAPTURE.inspect(self.file)
        self.assertEqual(result["schema"], "xiio.hex.capture-nonblank/v1")
        self.assertEqual(result["width"], 800)
        self.assertEqual(result["height"], 600)
        self.assertGreater(result["non_dominant_luma_pixels"], 10000)
        self.assertGreater(result["distinct_visible_luma_bins"], 8)
        self.assertEqual(result["screenshot_sha256"], hashlib.sha256(self.file.read_bytes()).hexdigest())
        self.assertFalse(result["semantic_ui_verified"])
        self.assertFalse(result["selected_window_pixels_verified"])

    def test_exact_false_green_two_color_window_is_rejected(self):
        # 1600x1000 hosted artefact: 1,296,000 pale + 304,000 black pixels,
        # no controls or text; it passed the earlier minority-pixel threshold.
        image = Image.new("RGB", (1600, 1000), "black")
        ImageDraw.Draw(image).rectangle((0, 0, 1349, 959),
                                       fill=(246, 245, 244))
        image.save(self.file)
        self.rejected("PNG_FLAT_FRAME_NO_UI_TEXTURE")

    def test_three_flat_painted_bands_are_not_application_ui(self):
        image = Image.new("RGB", (800, 600), "black")
        painter = ImageDraw.Draw(image)
        painter.rectangle((50, 50, 750, 300), fill=(100, 100, 100))
        painter.rectangle((50, 301, 750, 550), fill=(200, 200, 200))
        image.save(self.file)
        self.rejected("PNG_FLAT_FRAME_NO_UI_TEXTURE")

    def test_malformed_truncated_and_empty(self):
        self.image()
        raw = self.file.read_bytes()
        for candidate in [b"", b"notPNG", raw[:200]]:
            with self.subTest(size=len(candidate)):
                self.file.write_bytes(candidate)
                self.rejected()

    def test_size_limit_refused_before_decode(self):
        self.file.write_bytes(b"x" * (CAPTURE.MAX_BYTES + 1))
        self.rejected("PNG_FILE_INVALID_OR_OVER_BUDGET")

    def test_forged_large_dimensions_refused(self):
        self.image()
        raw = bytearray(self.file.read_bytes())
        raw[16:24] = struct.pack(">II", 5000, 5000)
        raw[29:33] = struct.pack(">I", zlib.crc32(raw[12:29]))
        self.file.write_bytes(raw)
        self.rejected("PNG_DIMENSIONS_OR_FORMAT_UNQUALIFIED")

    def test_small_capture_refused(self):
        self.image(size=(1, 1))
        self.rejected("PNG_DIMENSIONS_OR_FORMAT_UNQUALIFIED")

    def test_symlink_refused(self):
        target = Path(self.tmp.name) / "other.png"
        self.image()
        self.file.replace(target)
        self.file.symlink_to(target)
        self.rejected("PNG_FILE_INVALID_OR_OVER_BUDGET")

    def test_multi_frame_refused(self):
        a = Image.new("RGB", (800, 600), "black")
        b = Image.new("RGB", (800, 600), "white")
        # APNG with multiple frames must not be treated as one screenshot.
        a.save(self.file, save_all=True, append_images=[b], duration=100, loop=0)
        self.rejected("PNG_DIMENSIONS_OR_FORMAT_UNQUALIFIED")

    def test_visible_capture_byte_hash_distinguishes_generations(self):
        a = Image.new("RGB", (800, 600), "black")
        paint_fixture_ui(a)
        a.save(self.file)
        first = CAPTURE.inspect(self.file)["screenshot_sha256"]
        ImageDraw.Draw(a).rectangle((200, 200, 600, 400), fill="#777777")
        a.save(self.file)
        second = CAPTURE.inspect(self.file)["screenshot_sha256"]
        self.assertNotEqual(first, second)


if __name__ == "__main__":
    unittest.main()
