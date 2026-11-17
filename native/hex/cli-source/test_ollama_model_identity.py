#!/usr/bin/env python3
"""Hostile controls for exact Ollama model identity custody."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest

from capture_ollama_model_identity import ModelIdentityError, capture, observe, reopen


MODEL = "qwen2.5:1.5b"
DIGEST = "a" * 64


def tags(*, digest=DIGEST, size=986_000_000, model=MODEL):
    return {
        "models": [{
            "name": model,
            "model": model,
            "digest": digest,
            "size": size,
            "details": {
                "format": "gguf",
                "family": "qwen2",
                "parameter_size": "1.5B",
                "quantization_level": "Q4_K_M",
            },
        }]
    }


class OllamaModelIdentityTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="xiio-ollama-model-identity-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).absolute()
        self.baseline = self.root / "model-identity.json"
        self.readback = self.root / "model-identity-readback.json"

    def test_capture_and_independent_reopen_bind_exact_digest(self):
        captured = capture(MODEL, "http://127.0.0.1:11434", self.baseline,
                           fetch=lambda endpoint: tags())
        reopened = reopen(MODEL, "http://127.0.0.1:11434", self.baseline, self.readback,
                          fetch=lambda endpoint: tags())
        self.assertEqual(captured["digest"], DIGEST)
        self.assertEqual(reopened["digest"], DIGEST)
        self.assertEqual(reopened["state"], "OLLAMA_MODEL_IDENTITY_REOPEN_VERIFIED")
        self.assertEqual(stat.S_IMODE(self.baseline.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.readback.stat().st_mode), 0o600)
        self.assertFalse(reopened["provider_effect"])

    def test_same_tag_with_substituted_digest_or_size_refuses(self):
        capture(MODEL, "http://127.0.0.1:11434", self.baseline,
                fetch=lambda endpoint: tags())
        for changed in [tags(digest="b" * 64), tags(size=986_000_001)]:
            with self.subTest(changed=changed):
                with self.assertRaisesRegex(ModelIdentityError, "OLLAMA_MODEL_IDENTITY_CHANGED"):
                    reopen(MODEL, "http://127.0.0.1:11434", self.baseline, self.readback,
                           fetch=lambda endpoint, changed=changed: changed)
                self.assertFalse(self.readback.exists())

    def test_missing_invalid_or_ambiguous_digest_refuses(self):
        invalid = [tags(digest="latest"), {"models": []},
                   {"models": tags()["models"] + copy.deepcopy(tags()["models"])}]
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaises(ModelIdentityError):
                    observe(MODEL, value)

    def test_permissive_or_hard_linked_baseline_refuses(self):
        capture(MODEL, "http://127.0.0.1:11434", self.baseline,
                fetch=lambda endpoint: tags())
        self.baseline.chmod(0o644)
        with self.assertRaisesRegex(ModelIdentityError, "OLLAMA_MODEL_IDENTITY_CUSTODY_INVALID"):
            reopen(MODEL, "http://127.0.0.1:11434", self.baseline, self.readback,
                   fetch=lambda endpoint: tags())
        self.baseline.chmod(0o600)
        os.link(self.baseline, self.root / "identity-alias.json")
        with self.assertRaisesRegex(ModelIdentityError, "OLLAMA_MODEL_IDENTITY_CUSTODY_INVALID"):
            reopen(MODEL, "http://127.0.0.1:11434", self.baseline, self.readback,
                   fetch=lambda endpoint: tags())

    def test_baseline_identity_and_claim_ceilings_cannot_be_promoted(self):
        capture(MODEL, "http://127.0.0.1:11434", self.baseline,
                fetch=lambda endpoint: tags())
        value = json.loads(self.baseline.read_text())
        for key, replacement in [("model", "other:latest"), ("endpoint", "http://other"),
                                 ("effect_authority", True), ("provider_effect", True),
                                 ("billing_effect_authority", True)]:
            with self.subTest(key=key):
                changed = {**value, key: replacement}
                self.baseline.write_text(json.dumps(changed) + "\n")
                self.baseline.chmod(0o600)
                with self.assertRaisesRegex(ModelIdentityError, "OLLAMA_MODEL_IDENTITY_BASELINE_INVALID"):
                    reopen(MODEL, "http://127.0.0.1:11434", self.baseline, self.readback,
                           fetch=lambda endpoint: tags())
                self.baseline.write_text(json.dumps(value) + "\n")
                self.baseline.chmod(0o600)


if __name__ == "__main__":
    unittest.main(verbosity=2)
