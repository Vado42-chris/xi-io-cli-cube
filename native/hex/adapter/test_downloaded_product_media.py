import hashlib
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from native_product_receiver import ProductReceiverError, _offline_payload_reader, installed_framework_hint


class DownloadedMediaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.media = self.root / "payloads"
        self.url = "https://example.test/download"
        self.data = b"product bytes"
        self.entry = SimpleNamespace(source="app", sha256=hashlib.sha256(self.data).hexdigest(), size=len(self.data))
        self.profile = {"products": {"root": (SimpleNamespace(entries=[self.entry]), {"app": self.url}, ())}}

    def reader(self):
        return _offline_payload_reader(self.root / "bundle.lock.json", self.profile)

    def test_existing_online_release_keeps_its_provider(self):
        self.assertIsNone(self.reader())

    def test_downloaded_product_uses_exact_digest_file(self):
        self.media.mkdir()
        (self.media / self.entry.sha256).write_bytes(self.data)
        out = self.root / "staged"
        self.reader()(self.url, out, self.entry.size)
        self.assertEqual(out.read_bytes(), self.data)

    def test_incomplete_media_refuses_and_never_falls_back_to_network(self):
        self.media.mkdir()
        with self.assertRaises(FileNotFoundError):
            self.reader()(self.url, self.root / "out", self.entry.size)
        self.assertFalse((self.root / "out").exists())

    def test_linked_media_and_linked_payload_refused(self):
        backing = self.root / "another"
        backing.mkdir()
        self.media.symlink_to(backing, target_is_directory=True)
        with self.assertRaisesRegex(ProductReceiverError, "PRODUCT_MEDIA_DIRECTORY_INVALID"):
            self.reader()
        self.media.unlink()
        self.media.mkdir()
        (self.media / self.entry.sha256).symlink_to(backing)
        with self.assertRaises(OSError):
            self.reader()(self.url, self.root / "out", self.entry.size)

    def test_zero_byte_media_is_refused_without_staged_output(self):
        self.media.mkdir()
        (self.media / self.entry.sha256).write_bytes(b"")
        target = self.root / "staged"
        with self.assertRaisesRegex(ProductReceiverError, "PRODUCT_MEDIA_FILE_INVALID"):
            self.reader()(self.url, target, self.entry.size)
        self.assertFalse(target.exists())

    def test_even_digest_pinned_empty_payload_is_refused(self):
        self.entry.sha256 = hashlib.sha256(b"").hexdigest()
        self.entry.size = 0
        self.media.mkdir()
        (self.media / self.entry.sha256).write_bytes(b"")
        with self.assertRaisesRegex(ProductReceiverError, "PRODUCT_MEDIA_ENTRY_INVALID"):
            self.reader()(self.url, self.root / "staged", 0)
        self.assertFalse((self.root / "staged").exists())

    def test_truncated_media_refused_before_output(self):
        self.media.mkdir()
        (self.media / self.entry.sha256).write_bytes(self.data[:-1])
        with self.assertRaisesRegex(ProductReceiverError, "PRODUCT_MEDIA_FILE_INVALID"):
            self.reader()(self.url, self.root / "staged", self.entry.size)
        self.assertFalse((self.root / "staged").exists())

    def test_same_size_wrong_bytes_are_removed_before_return(self):
        self.media.mkdir()
        (self.media / self.entry.sha256).write_bytes(b"x" * self.entry.size)
        with self.assertRaisesRegex(ProductReceiverError, "PRODUCT_MEDIA_DIGEST_MISMATCH"):
            self.reader()(self.url, self.root / "staged", self.entry.size)
        self.assertFalse((self.root / "staged").exists())

    def test_staging_collision_does_not_remove_incumbent_file(self):
        self.media.mkdir()
        (self.media / self.entry.sha256).write_bytes(self.data)
        target = self.root / "staged"
        target.write_bytes(b"incumbent")
        with self.assertRaises(FileExistsError):
            self.reader()(self.url, target, self.entry.size)
        self.assertEqual(target.read_bytes(), b"incumbent")

    def test_missing_installer_history_creates_nothing(self):
        self.assertEqual(installed_framework_hint(self.root), {})
        self.assertEqual(list(self.root.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
