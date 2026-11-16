"""HEX consumption of the accepted Installer pre-command gate, disposable only."""
import inspect
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import child_bundle
import installer_adapter
from test_bundle import BundleFixture


class PrecommandBoundary(unittest.TestCase):
    def test_all_bundle_children_refused_before_custody_or_network(self):
        with tempfile.TemporaryDirectory(prefix="hex-precommand-") as d:
            f = BundleFixture(Path(d))
            f.child("cli").child("bins", depends_on=("cli",))
            lock, lock_sha = f.lock()
            called = []
            def fail_before_any_effect(manifests, roots, *, machine_profile, additional_targets):
                called.append((manifests, roots, machine_profile, additional_targets))
                raise RuntimeError("SYNTHETIC_NTFS_UNSUPPORTED")
            with patch.object(child_bundle, "qualify_precommand_manifests",
                              side_effect=fail_before_any_effect), \
                 patch.object(f, "fetch", side_effect=AssertionError("NO_NETWORK")):
                with self.assertRaisesRegex(RuntimeError, "SYNTHETIC_NTFS_UNSUPPORTED"):
                    child_bundle.install_bundle(lock, approved_lock_sha256=lock_sha,
                                                env=f.env, fetch=f.fetch)
            self.assertEqual(len(called), 1)
            manifests, roots, machine, extras = called[0]
            self.assertEqual(len(manifests), 2)
            self.assertEqual(set(roots), {"xdg_data", "xdg_state", "xdg_config", "xdg_cache"})
            self.assertEqual(machine["family"], "linux")
            self.assertTrue(any("bundles" in str(p) for p in extras))
            self.assertFalse((Path(f.env["XDG_STATE_HOME"]) /
                              "xi-io/installer/bundles/core-test").exists())
            self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io").exists())

    def test_cli_and_connection_qualification_precedes_first_install_command(self):
        source = inspect.getsource(installer_adapter.handle)
        qualify = source.index("qualification = qualify_precommand_manifests(")
        journal = source.index("journal.start('Apply exact reviewed CLI generation'")
        connection = source.index("connection_profile.apply(base,p,SOURCE/'connection')")
        installer = source.index("str(SOURCE/'install.mjs')")
        self.assertLess(qualify, journal)
        self.assertLess(qualify, connection)
        self.assertLess(connection, installer)
        self.assertIn("xdg_roots(connection_profile.roots(p))", source)
        for target in ["prefix/'versions'", "prefix/'bin'", "base/'operations'"]:
            self.assertIn(target, source)

    def test_launcher_repair_qualifies_before_node_and_repair_command(self):
        source = inspect.getsource(installer_adapter.handle_repair)
        qualified = source.index("qualification = qualify_precommand_targets(")
        node = source.index("verify_node(p)")
        journal = source.index("journal.start('Repair only exact reviewed existing CLI launcher'")
        command = source.index("str(SOURCE/REPAIR_INSTALLER)")
        self.assertLess(qualified, node)
        self.assertLess(qualified, journal)
        self.assertLess(journal, command)
        self.assertIn("p['launcher_before']['mode']", source)
        self.assertIn("Path(p['backup']).parent", source)

    def test_one_accepted_kernel_owns_precommand_qualification(self):
        from xiio_installer.transaction import qualify_precommand_manifests
        self.assertTrue(callable(qualify_precommand_manifests))
        source = inspect.getsource(qualify_precommand_manifests)
        self.assertIn("qualify_precommand_targets", source)
        self.assertIn("manifest.entries", source)
        self.assertIn("additional_targets", source)


if __name__ == "__main__":
    unittest.main()
