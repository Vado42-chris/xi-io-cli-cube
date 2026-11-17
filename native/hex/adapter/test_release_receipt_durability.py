import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "kernel"))

from native.hex.adapter.child_bundle import BundleError
from native.hex.adapter.release_binding import (
    _persist_release_receipt,
    _read_release_receipt,
)


class ReleaseReceiptDurabilityTests(unittest.TestCase):
    def receipt(self):
        return {
            "schema": "xiio.installer.release-distribution-install-receipt/v1",
            "product_ref": "product-demo",
            "consumer_ref": "consumer:hex",
            "release_generation": "generation-demo",
        }

    def test_hard_linked_receipt_is_untrusted(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            target = root / "receipt.json"
            target.write_text(json.dumps(self.receipt()), encoding="utf-8")
            target.chmod(0o600)
            os.link(target, root / "receipt-alias.json")
            state_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with self.assertRaisesRegex(
                    BundleError, "BUNDLE_RELEASE_INSTALL_RECEIPT_UNTRUSTED"
                ):
                    _read_release_receipt(state_fd, target.name)
            finally:
                os.close(state_fd)

    def test_atomic_receipt_rename_fsyncs_state_directory(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            state_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            real_fsync = os.fsync
            try:
                with patch(
                    "native.hex.adapter.release_binding.os.fsync",
                    side_effect=real_fsync,
                ) as fsync:
                    _persist_release_receipt(
                        state_fd,
                        root,
                        "receipt.json",
                        self.receipt(),
                    )
                self.assertIn(state_fd, [call.args[0] for call in fsync.call_args_list])
                self.assertEqual(
                    json.loads((root / "receipt.json").read_text(encoding="utf-8")),
                    self.receipt(),
                )
            finally:
                os.close(state_fd)


if __name__ == "__main__":
    unittest.main()
