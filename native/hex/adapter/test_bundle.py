"""Actual existing-kernel child bundle tests, disposable paths, zero network/host effects."""
import hashlib
import io
from email.message import Message
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request
import json
import multiprocessing as mp
import os
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "kernel"))

from xiio_installer.dependency_receipt_verification import verify_dependency_binding_receipt

from child_bundle import (
    BundleError,
    _safe_url,
    _HTTPSRedirectOnly,
    load_bundle_profile as _load_bundle_profile,
    install_bundle as _install_bundle,
)
from xiio_installer.transaction import rollback

# Local synthetic release source only. Production must pass the actual
# approved provider hosts explicitly from its installed release authority.
FIXTURE_RELEASE_HOSTS = frozenset({"github.com"})


def load_bundle_profile(lock, **kwargs):
    kwargs.setdefault("allowed_hosts", FIXTURE_RELEASE_HOSTS)
    return _load_bundle_profile(lock, **kwargs)


def install_bundle(lock, **kwargs):
    kwargs.setdefault("allowed_hosts", FIXTURE_RELEASE_HOSTS)
    return _install_bundle(lock, **kwargs)


def sha(value):
    return hashlib.sha256(value).hexdigest()


class BundleFixture:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(exist_ok=True)
        self.env = {
            "HOME": str(root),
            "XDG_CONFIG_HOME": str(root / "config"),
            "XDG_DATA_HOME": str(root / "data"),
            "XDG_STATE_HOME": str(root / "state"),
            "XDG_CACHE_HOME": str(root / "cache"),
        }
        self.payloads = {}
        self.rows = []

    def child(self, role, *, depends_on=(), bytes_=None, destination=None,
              fixture=True, overwrite="fail", accepted_generation=None, runtime_export=False):
        b = bytes_ if bytes_ is not None else (role + " delivered\n").encode()
        url = "https://github.com/xiio-test/releases/" + role + ".bin"
        self.payloads[url] = b
        name = role + ".manifest.json"
        source = role + ".bin"
        product_id = "xi-io-" + role
        manifest = {
            "schema_version": "xiio-installer-product-manifest-v1",
            "profile_id": "core-test",
            "product_id": product_id,
            "display_name": "XIIO " + role,
            "version": "0.0.1-fixture" if fixture else "0.0.1",
            "channel": "fixture" if fixture else "alpha",
            "fixture": fixture,
            **({"accepted_generation": accepted_generation} if accepted_generation else {}),
            **({"dependency_id":role,"owner_repo":"owner/"+role,"runtime_exports":{"module":{"destination_scope":"xdg_data","destination":destination or "xi-io/"+role+"/"+source}}} if runtime_export else {}),
            "payload": [{
                "source": source,
                "sha256": sha(b),
                "size": len(b),
                "destination_scope": "xdg_data",
                "destination": destination or "xi-io/" + role + "/" + source,
                "mode": "0644",
                "overwrite": overwrite,
            }],
        }
        raw = json.dumps(manifest, sort_keys=True).encode()
        (self.root / name).write_bytes(raw)
        self.rows.append({
            "role": role, "product_id": product_id,
            "manifest": name, "manifest_sha256": sha(raw),
            "depends_on": list(depends_on), "payload_urls": {source: url},
        })
        return self

    def lock(self, *, fixture=True, profile_mode="suite", product_root_role=None):
        profile = {
            "schema_version": "xiio-installer-bundle-profile-v1",
            "profile_id": "core-test", "fixture": fixture,
            "products": self.rows,
        }
        if profile_mode == "product":
            profile["profile_mode"] = "product"
            profile["product_root_role"] = product_root_role
        raw = json.dumps(profile, sort_keys=True).encode()
        path = self.root / "bundle.lock.json"
        path.write_bytes(raw)
        return path, sha(raw)

    def fetch(self, url, output, limit):
        if url not in self.payloads:
            raise ValueError("UNEXPECTED_FIXTURE_URL")
        content = self.payloads[url]
        if len(content) > limit:
            raise ValueError("OVER_LIMIT")
        output.write_bytes(content)



class BundleTests(unittest.TestCase):
    def fixture(self):
        td = tempfile.TemporaryDirectory(prefix="xiio-bundle-fixture-")
        self.addCleanup(td.cleanup)
        return BundleFixture(Path(td.name))


    def test_missing_release_provider_refuses_before_fetch_or_target_write(self):
        f = self.fixture()
        f.child("cli")
        lock, digest = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_RELEASE_PROVIDER_UNBOUND"):
            _load_bundle_profile(lock)
        with self.assertRaisesRegex(BundleError, "BUNDLE_RELEASE_PROVIDER_UNBOUND"):
            _install_bundle(lock, approved_lock_sha256=digest,
                            env=f.env, fetch=lambda *_: self.fail("fetch without provider binding"))
        self.assertFalse((Path(f.env["XDG_STATE_HOME"]) / "xi-io").exists())
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io").exists())

    def test_explicit_non_github_release_source_uses_same_white_label_installer(self):
        f = self.fixture()
        f.child("cli", fixture=False)
        old = f.rows[0]["payload_urls"]["cli.bin"]
        data = f.payloads.pop(old)
        host = "packages.example.org"
        url = f"https://{host}/releases/cli.bin"
        f.payloads[url] = data
        f.rows[0]["payload_urls"]["cli.bin"] = url
        lock, digest = f.lock(fixture=False)
        hosts = frozenset({host})
        self.assertEqual(load_bundle_profile(lock, allowed_hosts=hosts)["profile_mode"], "suite")
        result = install_bundle(lock, approved_lock_sha256=digest, env=f.env,
                                allowed_hosts=hosts, fetch=f.fetch)
        self.assertEqual(result["state"], "INSTALLED_BYTES_VERIFIED")
        self.assertEqual(result["receipt_count"], 1)
        self.assertFalse(result["runtime_qualified"])
        self.assertFalse(result["authority_granted"])


    def test_installed_child_with_generation_persists_release_distribution_receipt(self):
        f=self.fixture();generation="a"*40;f.child("sdk",fixture=False,accepted_generation=generation)
        lock,digest=f.lock(fixture=False);result=install_bundle(lock,approved_lock_sha256=digest,env=f.env,fetch=f.fetch)
        row=result["release_distribution_receipts"]["sdk"];receipt=json.loads(Path(row["path"]).read_text())
        self.assertEqual(receipt["schema"],"xiio.installer.release-distribution-install-receipt/v1")
        self.assertEqual(receipt["product_ref"],"xi-io-sdk");self.assertEqual(receipt["release_generation"],generation)
        self.assertEqual(receipt["bundle_state"],"INSTALLED_BYTES_VERIFIED");self.assertTrue(receipt["readback_verified"]);self.assertFalse(receipt["effect_authority"])
        self.assertEqual(Path(row["path"]).stat().st_mode & 0o777,0o600)


    def test_bundle_emits_dependency_binding_receipt_from_exact_installed_export(self):
        f=self.fixture();generation="b"*40;f.child("node",fixture=False,accepted_generation=generation,runtime_export=True)
        lock,digest=f.lock(fixture=False);result=install_bundle(lock,approved_lock_sha256=digest,env=f.env,fetch=f.fetch)
        row=result["dependency_binding_receipts"]["node"];receipt=json.loads(Path(row["path"]).read_text())
        self.assertEqual(receipt["schema"],"xiio.installer-dependency-binding-receipt/v1");self.assertEqual(receipt["dependency_id"],"node")
        self.assertEqual(receipt["state"],"BOUND");self.assertEqual(receipt["accepted_generation"],generation);self.assertEqual(set(receipt["fields"]),set(receipt["runtime_exports"]));self.assertTrue(Path(receipt["release_receipt_path"]).is_file());self.assertTrue(Path(receipt["fields"]["module"]).is_file());self.assertEqual(Path(receipt["binding_receipt_path"]).resolve(),Path(row["path"]).resolve());self.assertFalse(receipt["effect_authority"])
        verified=verify_dependency_binding_receipt(Path(row["path"]),expected_dependency_id="node",expected_owner_repo="owner/node",expected_generation=generation)
        self.assertEqual(verified["state"],"VERIFIED");self.assertTrue(verified["custody_verified"])

    def test_release_hosts_reject_wildcards_private_local_and_malformed(self):
        f = self.fixture()
        f.child("cli")
        lock, _ = f.lock()
        for hosts in (frozenset(), {"github.com"}, frozenset({"*.example.org"}),
                      frozenset({"127.0.0.1"}), frozenset({"localhost.local"}),
                      frozenset({"EXAMPLE.ORG"}), frozenset({"one..example.org"})):
            with self.subTest(hosts=hosts):
                with self.assertRaisesRegex(
                    BundleError, "BUNDLE_RELEASE_PROVIDER_(?:UNBOUND|HOST_INVALID)"
                ):
                    _load_bundle_profile(lock, allowed_hosts=hosts)

    def test_redirect_uses_explicit_release_hosts_not_github_domains(self):
        hosts = frozenset({"releases.example.org", "files.example.org"})
        signed_redirect = "https://files.example.org/assets/object?sig=opaque"
        self.assertEqual(_safe_url(signed_redirect, hosts, redirect=True), signed_redirect)
        with self.assertRaisesRegex(BundleError, "BUNDLE_URL_NOT_APPROVED"):
            _safe_url(signed_redirect, hosts)
        with self.assertRaisesRegex(BundleError, "BUNDLE_URL_NOT_APPROVED"):
            _safe_url("https://objects.githubusercontent.com/object?sig=opaque",
                      hosts, redirect=True)

    def test_malformed_ports_are_typed_refusals_before_fetch_or_write(self):
        for port in ("not-a-port", "65536", "-1"):
            with self.subTest(port=port):
                url = f"https://github.com:{port}/releases/cli.bin"
                for redirect in (False, True):
                    with self.assertRaisesRegex(BundleError, "^BUNDLE_URL_INVALID$"):
                        _safe_url(url, FIXTURE_RELEASE_HOSTS, redirect=redirect)
                f = self.fixture()
                f.child("cli")
                f.rows[0]["payload_urls"]["cli.bin"] = url
                lock, digest = f.lock()
                with self.assertRaisesRegex(BundleError, "^BUNDLE_URL_INVALID$"):
                    install_bundle(lock, approved_lock_sha256=digest, env=f.env,
                                   fetch=lambda *_: self.fail("fetch with invalid port"))
                for name in ("XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME"):
                    self.assertFalse(Path(f.env[name]).exists())

    def test_raw_url_controls_and_whitespace_refuse_before_fetch_or_write(self):
        # urlsplit and Request normalize different raw bytes. Validate the exact
        # approved spelling before either parser can silently discard them.
        chars = [chr(i) for i in range(33)] + [chr(127), "\u00a0", "\u2003"]
        for char in chars:
            for url in (char + "https://github.com/releases/cli.bin",
                        "https://github.com/releases/c" + char + "li.bin",
                        "https://github.com/releases/cli.bin" + char):
                with self.subTest(url=repr(url)):
                    for redirect in (False, True):
                        with self.assertRaisesRegex(BundleError, "^BUNDLE_URL_INVALID$"):
                            _safe_url(url, FIXTURE_RELEASE_HOSTS, redirect=redirect)
                    f = self.fixture()
                    f.child("cli")
                    f.rows[0]["payload_urls"]["cli.bin"] = url
                    lock, digest = f.lock()
                    with self.assertRaisesRegex(BundleError, "^BUNDLE_URL_INVALID$"):
                        install_bundle(lock, approved_lock_sha256=digest, env=f.env,
                                       fetch=lambda *_: self.fail("fetch with raw control"))
                    for name in ("XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME"):
                        self.assertFalse(Path(f.env[name]).exists())
        encoded = "https://github.com/releases/my%20asset.bin"
        self.assertEqual(_safe_url(encoded, FIXTURE_RELEASE_HOSTS), encoded)
        signed = encoded + "?sig=opaque%20value"
        self.assertEqual(_safe_url(signed, FIXTURE_RELEASE_HOSTS, redirect=True), signed)

    def test_real_redirect_callbacks_refuse_raw_header_controls_before_normalization(self):
        # No network: exercise urllib's actual entrypoint, not just redirect_request.
        for status in (301, 302, 303, 307, 308):
            for header in ("Location", "URI"):
                for char in [chr(i) for i in range(33)] + [chr(127), "\u00a0", "\u2003"]:
                    with self.subTest(status=status, header=header, char=repr(char)):
                        handler = _HTTPSRedirectOnly(FIXTURE_RELEASE_HOSTS)
                        class RefuseOpen:
                            def open(inner, *_args, **_kwargs):
                                self.fail("redirect dispatched a raw-control header")
                        handler.parent = RefuseOpen()
                        request = Request("https://github.com/releases/original.bin")
                        request.timeout = 1
                        headers = Message()
                        headers[header] = "https://github.com/releases/c" + char + "li.bin"
                        with self.assertRaisesRegex(BundleError, "^BUNDLE_URL_INVALID$"):
                            getattr(handler, "http_error_" + str(status))(
                                request, io.BytesIO(b""), status, "Redirect", headers)

    def test_real_redirect_callbacks_preserve_relative_and_signed_encoded_urls(self):
        for status in (301, 302, 303, 307, 308):
            for header in ("Location", "URI"):
                for target, expected in (
                    ("next%20asset.bin", "https://github.com/releases/next%20asset.bin"),
                    ("https://github.com/releases/a%20b.bin?sig=opaque%20value&token=a%2Fb%3D",
                     "https://github.com/releases/a%20b.bin?sig=opaque%20value&token=a%2Fb%3D"),
                ):
                    with self.subTest(status=status, header=header, target=target):
                        calls = []
                        class RecordOpen:
                            def open(inner, request, **kwargs):
                                calls.append((request.full_url, kwargs))
                                return "TEST_ONLY_RESPONSE"
                        handler = _HTTPSRedirectOnly(FIXTURE_RELEASE_HOSTS)
                        handler.parent = RecordOpen()
                        request = Request("https://github.com/releases/original.bin")
                        request.timeout = 1
                        headers = Message()
                        headers[header] = target
                        # Preserve the installed stdlib's redirect semantics.
                        # Python 3.10 rejects 308; newer runtimes support it.
                        # This is an asserted refusal, not a skipped case.
                        baseline_request = Request("https://github.com/releases/original.bin")
                        try:
                            HTTPRedirectHandler().redirect_request(
                                baseline_request, None, status, "Redirect", headers, expected)
                        except HTTPError as error:
                            self.assertEqual(status, 308)
                            self.assertEqual(error.code, status)
                            with self.assertRaises(HTTPError) as raised:
                                getattr(handler, "http_error_" + str(status))(
                                    request, io.BytesIO(b""), status, "Redirect", headers)
                            self.assertEqual(raised.exception.code, status)
                            self.assertEqual(calls, [])
                        else:
                            result = getattr(handler, "http_error_" + str(status))(
                                request, io.BytesIO(b""), status, "Redirect", headers)
                            self.assertEqual(result, "TEST_ONLY_RESPONSE")
                            self.assertEqual(calls, [(expected, {"timeout": 1})])

    def test_product_profile_installs_only_selected_root_and_transitive_dependencies(self):
        f = self.fixture()
        f.child("bins", fixture=False).child("ward", fixture=False, depends_on=("bins",)).child(
            "sam-law", fixture=False, depends_on=("ward",)
        )
        lock, digest = f.lock(fixture=False, profile_mode="product", product_root_role="sam-law")
        profile = load_bundle_profile(lock)
        self.assertEqual(profile["profile_mode"], "product")
        self.assertEqual(profile["product_root_role"], "sam-law")
        self.assertEqual(profile["ordered_roles"], ("bins", "ward", "sam-law"))
        self.assertEqual(set(profile["products"]), {"bins", "ward", "sam-law"})
        self.assertEqual(len(profile["products"]), 3)
        fetched = []
        def fetch(url, output, limit):
            fetched.append(url)
            f.fetch(url, output, limit)
        result = install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=fetch)
        self.assertEqual(result["receipt_count"], 3)
        self.assertEqual(len(fetched), 3)
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/unrelated/unrelated.bin").exists())

    def test_precommand_noexec_before_download_and_first_product_effect(self):
        f = self.fixture()
        f.child("cli")
        manifest_path = f.root / "cli.manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["payload"][0]["mode"] = "0755"
        raw = json.dumps(manifest, sort_keys=True).encode()
        manifest_path.write_bytes(raw)
        f.rows[0]["manifest_sha256"] = sha(raw)
        lock, digest = f.lock()
        fetched = []
        def not_fetched(*args):
            fetched.append(args)
            raise AssertionError("DOWNLOAD_WAS_ALLOWED_BEFORE_FILESYSTEM_PROOF")
        with patch("xiio_installer.transaction.subprocess.run",
                   side_effect=PermissionError("NTFS/noexec EACCES")) as launch:
            with self.assertRaisesRegex(BundleError, "BUNDLE_FILESYSTEM_UNQUALIFIED"):
                install_bundle(lock, approved_lock_sha256=digest,
                               env=f.env, fetch=not_fetched)
            launch.assert_called()
        self.assertEqual(fetched, [])
        state_root = Path(f.env["XDG_STATE_HOME"]) / "xi-io/installer/bundles/core-test"
        self.assertFalse(state_root.exists())
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/cli/cli.bin").exists())
        self.assertEqual(list(f.root.rglob(".xiio-fs-probe-*")), [])

    def test_precommand_must_cover_every_child_before_download(self):
        f = self.fixture()
        f.child("cli").child("bins", depends_on=("cli",))
        lock, digest = f.lock()
        checked = []
        def bounded_probe(manifests, roots, **kwargs):
            checked.extend((item[0].product_id, item[1]) for item in manifests)
            raise ValueError("UNQUALIFIED_SECOND_CHILD")
        with patch("child_bundle.qualify_precommand_manifests",
                   side_effect=bounded_probe):
            with self.assertRaises(ValueError):
                install_bundle(lock, approved_lock_sha256=digest,
                               env=f.env, fetch=lambda *_: self.fail("download before preflight"))
        self.assertEqual([item[0] for item in checked], ["xi-io-cli", "xi-io-bins"])

    def test_product_profile_refuses_extra_unrelated_role_instead_of_silently_installing_it(self):
        f = self.fixture()
        f.child("dependency").child("selected", depends_on=("dependency",)).child("unrelated")
        lock, _ = f.lock(profile_mode="product", product_root_role="selected")
        with self.assertRaisesRegex(BundleError, "BUNDLE_PRODUCT_PROFILE_NOT_EXACT_DEPENDENCY_CLOSURE"):
            load_bundle_profile(lock)

    def test_product_profile_requires_existing_selected_root(self):
        f = self.fixture()
        f.child("dependency")
        lock, _ = f.lock(profile_mode="product", product_root_role="missing")
        with self.assertRaisesRegex(BundleError, "BUNDLE_PRODUCT_ROOT_NOT_IN_PROFILE"):
            load_bundle_profile(lock)

    def test_product_profile_detects_transitive_missing_dependency_and_cycle(self):
        f = self.fixture()
        f.child("dependency", depends_on=("missing",)).child("selected", depends_on=("dependency",))
        lock, _ = f.lock(profile_mode="product", product_root_role="selected")
        with self.assertRaisesRegex(BundleError, "BUNDLE_DEPENDENCY_NOT_IN_PROFILE"):
            load_bundle_profile(lock)
        f.rows[0]["depends_on"] = ["selected"]
        lock, _ = f.lock(profile_mode="product", product_root_role="selected")
        with self.assertRaisesRegex(BundleError, "BUNDLE_DEPENDENCY_CYCLE"):
            load_bundle_profile(lock)

    def test_two_children_install_in_dependency_order_and_manual_rollback(self):
        f = self.fixture()
        f.child("bins", depends_on=("cli",)).child("cli")
        lock, digest = f.lock()
        p = load_bundle_profile(lock)
        self.assertEqual(p["ordered_roles"], ("cli", "bins"))
        r = install_bundle(lock, approved_lock_sha256=digest,
                           env=f.env, fetch=f.fetch)
        self.assertEqual(r["state"], "INSTALLED_BYTES_VERIFIED")
        self.assertEqual(r["receipt_count"], 2)
        self.assertFalse(r["runtime_qualified"])
        self.assertFalse(r["device_connected"])
        self.assertFalse(r["authority_granted"])
        self.assertFalse(r["child_services_started"])
        cli = Path(f.env["XDG_DATA_HOME"]) / "xi-io/cli/cli.bin"
        bins = Path(f.env["XDG_DATA_HOME"]) / "xi-io/bins/bins.bin"
        self.assertEqual(cli.read_bytes(), f.payloads["https://github.com/xiio-test/releases/cli.bin"])
        self.assertEqual(bins.read_bytes(), f.payloads["https://github.com/xiio-test/releases/bins.bin"])
        receipts = list((Path(f.env["XDG_STATE_HOME"]) /
                         "xi-io/installer/bundles/core-test").glob("*.receipt.json"))
        self.assertEqual(len(receipts), 2)
        for item in reversed(receipts):
            rollback(item, f.env)
        self.assertFalse(cli.exists())
        self.assertFalse(bins.exists())

    def test_digest_mismatch_blocks_every_product_before_install(self):
        f = self.fixture()
        f.child("cli").child("ward")
        lock, digest = f.lock()
        url = "https://github.com/xiio-test/releases/ward.bin"
        f.payloads[url] = b"X" * len(f.payloads[url])
        with self.assertRaisesRegex(BundleError, "BUNDLE_DOWNLOADED_SIZE_MISMATCH|BUNDLE_DOWNLOADED_DIGEST_MISMATCH"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/cli/cli.bin").exists())

    def test_wrong_approval_never_fetches(self):
        f = self.fixture()
        f.child("cli")
        lock, _digest = f.lock()
        def do_not_fetch(*_):
            raise AssertionError("DOWNLOAD_OR_EFFECT_BEFORE_APPROVAL")
        with self.assertRaisesRegex(BundleError, "BUNDLE_APPROVAL_DIGEST_MISMATCH"):
            install_bundle(lock, approved_lock_sha256="a"*64,
                           env=f.env, fetch=do_not_fetch)

    def test_loop_and_missing_dependency_rejected_before_effect(self):
        f = self.fixture()
        f.child("cli", depends_on=("bins",)).child("bins", depends_on=("cli",))
        lock, _ = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_DEPENDENCY_CYCLE"):
            load_bundle_profile(lock)
        f.rows[1]["depends_on"] = ["elsewhere"]
        lock, _ = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_DEPENDENCY_NOT_IN_PROFILE"):
            load_bundle_profile(lock)

    def test_nonfixture_suite_uses_verified_lock_not_donor_product_roster(self):
        f = self.fixture()
        f.child("desktop-shell", fixture=False)
        f.child("specialist-tool", fixture=False, depends_on=("desktop-shell",))
        lock, digest = f.lock(fixture=False)
        profile = load_bundle_profile(lock)
        self.assertEqual(profile["profile_mode"], "suite")
        self.assertEqual(profile["ordered_roles"], ("desktop-shell", "specialist-tool"))
        result = install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertEqual(result["receipt_count"], 2)
        self.assertEqual(result["state"], "INSTALLED_BYTES_VERIFIED")
        self.assertFalse(result["runtime_qualified"])
        self.assertFalse(result["authority_granted"])

    def test_duplicate_product_identity_across_distinct_roles_is_refused_before_download(self):
        f = self.fixture()
        f.child("alpha", fixture=False)
        f.child("beta", fixture=False, depends_on=("alpha",))
        # The second manifest, digest and destination are individually valid.
        # Aliased roles still cannot install the same product twice.
        second = f.root / "beta.manifest.json"
        manifest = json.loads(second.read_text())
        manifest["product_id"] = "xi-io-alpha"
        raw = json.dumps(manifest, sort_keys=True).encode()
        second.write_bytes(raw)
        f.rows[1]["product_id"] = "xi-io-alpha"
        f.rows[1]["manifest_sha256"] = sha(raw)
        lock, digest = f.lock(fixture=False)
        with self.assertRaisesRegex(BundleError, "BUNDLE_DUPLICATE_PRODUCT_ID"):
            load_bundle_profile(lock)
        attempted = []
        def fetch(*args):
            attempted.append(args)
            raise AssertionError("FETCH_WITH_DUPLICATE_PRODUCT_ID")
        with self.assertRaisesRegex(BundleError, "BUNDLE_DUPLICATE_PRODUCT_ID"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=fetch)
        self.assertEqual(attempted, [])
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/alpha/alpha.bin").exists())
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/beta/beta.bin").exists())

    def test_duplicate_destinations_rejected(self):
        f = self.fixture()
        f.child("cli", destination="xi-io/shared/common.bin")
        f.child("bins", destination="xi-io/shared/common.bin")
        lock, _ = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_DESTINATION_COLLISION"):
            load_bundle_profile(lock)

    def test_http_urls_and_embedded_credentials_rejected(self):
        f = self.fixture()
        f.child("cli")
        f.rows[0]["payload_urls"]["cli.bin"] = "http://github.com/xiio-test/cli.bin"
        lock, _ = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_URL_NOT_APPROVED"):
            load_bundle_profile(lock)
        f.rows[0]["payload_urls"]["cli.bin"] = "https://user:token@github.com/xiio-test/cli.bin"
        lock, _ = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_URL_NOT_APPROVED"):
            load_bundle_profile(lock)

    def test_manifest_tamper_rejected_before_fetch(self):
        f = self.fixture()
        f.child("cli")
        lock, _ = f.lock()
        manifest = f.root / "cli.manifest.json"
        manifest.write_text(manifest.read_text().replace("XIIO cli", "XIIO tampered"))
        with self.assertRaisesRegex(BundleError, "BUNDLE_MANIFEST_DIGEST_MISMATCH"):
            load_bundle_profile(lock)

    def test_symlinked_manifest_rejected(self):
        f = self.fixture()
        f.child("cli")
        lock, _ = f.lock()
        (f.root / "cli.manifest.json").rename(f.root / "real-manifest.json")
        (f.root / "cli.manifest.json").symlink_to(f.root / "real-manifest.json")
        with self.assertRaisesRegex(BundleError, "BUNDLE_MANIFEST_PATH_ESCAPES_LOCK"):
            load_bundle_profile(lock)

    def test_legacy_backup_replace_not_automatically_admitted(self):
        f = self.fixture()
        f.child("cli", overwrite="backup_replace")
        lock, _ = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_REPLACEMENT_NOT_ADMITTED"):
            load_bundle_profile(lock)

    def test_bounded_mid_bundle_failure_rolls_back_first_product(self):
        f = self.fixture()
        f.child("cli").child("ward", depends_on=("cli",))
        lock, digest = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_APPLY_FAILED_ROLLED_BACK"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env,
                           fetch=f.fetch, fail_after_product=1)
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/cli/cli.bin").exists())
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/ward/ward.bin").exists())

    def test_existing_user_file_is_not_overwritten(self):
        f = self.fixture()
        f.child("cli")
        lock, digest = f.lock()
        original = Path(f.env["XDG_DATA_HOME"]) / "xi-io/cli/cli.bin"
        original.parent.mkdir(parents=True)
        original.write_text("PRESERVE USER BYTES\n")
        with self.assertRaisesRegex(Exception, "destination|already exists|overwrite|BUNDLE"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertEqual(original.read_bytes(), b"PRESERVE USER BYTES\n")

    def test_cube9_symlinked_xdg_state_root_refused_without_side_effects(self):
        f = self.fixture()
        outside = f.root / "outside"
        outside.mkdir()
        state_link = f.root / "symlinked_state"
        state_link.symlink_to(outside, target_is_directory=True)
        f.env["XDG_STATE_HOME"] = str(state_link)
        f.child("cli")
        lock, digest = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_STATE_ROOT_UNTRUSTED"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertFalse((outside / "xi-io").exists())

    def test_cube9_symlinked_intermediate_parent_refused_without_side_effects(self):
        f = self.fixture()
        outside = f.root / "outside"
        outside.mkdir()
        state_dir = Path(f.env["XDG_STATE_HOME"])
        state_dir.mkdir(parents=True, exist_ok=True)
        (state_dir / "xi-io").symlink_to(outside, target_is_directory=True)
        f.child("cli")
        lock, digest = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_STATE_ROOT_UNTRUSTED"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertFalse((outside / "installer").exists())

    def test_cube9_symlinked_leaf_refused(self):
        f = self.fixture()
        outside = f.root / "outside"
        outside.mkdir()
        bundles_dir = Path(f.env["XDG_STATE_HOME"]) / "xi-io" / "installer" / "bundles"
        bundles_dir.mkdir(parents=True, exist_ok=True)
        (bundles_dir / "core-test").symlink_to(outside, target_is_directory=True)
        f.child("cli")
        lock, digest = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_STATE_ROOT_UNTRUSTED"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertEqual(len(list(outside.iterdir())), 0)

    def test_cube9_readonly_ancestor_refused(self):
        f = self.fixture()
        state_dir = Path(f.env["XDG_STATE_HOME"])
        state_dir.mkdir(parents=True, exist_ok=True)
        xiio_dir = state_dir / "xi-io"
        xiio_dir.mkdir(mode=0o500)
        f.child("cli")
        lock, digest = f.lock()
        # When non-root or when permissions fail at the OS level:
        with patch("os.mkdir", side_effect=PermissionError(13, "Permission denied")):
            with self.assertRaisesRegex(BundleError, "BUNDLE_STATE_ROOT_UNTRUSTED"):
                install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)

    def test_cube9_file_ancestor_refused(self):
        f = self.fixture()
        state_dir = Path(f.env["XDG_STATE_HOME"])
        state_dir.mkdir(parents=True, exist_ok=True)
        (state_dir / "xi-io").write_text("regular file")
        f.child("cli")
        lock, digest = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_STATE_ROOT_UNTRUSTED"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)

    def test_cube9_concurrent_symlink_swap_refused(self):
        f = self.fixture()
        f.child("cli")
        lock, digest = f.lock()
        real_open = os.open
        def hostile_open(path, flags, *args, **kwargs):
            if flags & os.O_NOFOLLOW and "installer" in str(path):
                raise OSError(40, "Too many levels of symbolic links")
            return real_open(path, flags, *args, **kwargs)
        with patch("os.open", side_effect=hostile_open):
            with self.assertRaisesRegex(BundleError, "BUNDLE_STATE_ROOT_UNTRUSTED"):
                install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)

    def test_cube9_normal_clean_path_creates_strict_state_root(self):
        f = self.fixture()
        f.child("cli")
        lock, digest = f.lock()
        r = install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertEqual(r["state"], "INSTALLED_BYTES_VERIFIED")
        state_root = Path(f.env["XDG_STATE_HOME"]) / "xi-io" / "installer" / "bundles" / "core-test"
        self.assertTrue(state_root.is_dir())
        self.assertFalse(state_root.is_symlink())
        self.assertEqual(state_root.stat().st_mode & 0o777, 0o700)

    def test_six_product_baseline_transaction_and_rollback(self):
        f = self.fixture()
        f.child("cli", fixture=False)
        f.child("ibal", depends_on=("cli",), fixture=False)
        f.child("switchboard", depends_on=("cli",), fixture=False)
        f.child("bins", depends_on=("cli",), fixture=False)
        f.child("ward", depends_on=("cli",), fixture=False)
        f.child("inbox", depends_on=("cli", "ward"), fixture=False)
        lock, digest = f.lock(fixture=False)
        p = load_bundle_profile(lock)
        self.assertEqual(len(p["ordered_roles"]), 6)
        self.assertEqual(p["ordered_roles"][0], "cli")
        self.assertGreater(p["ordered_roles"].index("inbox"), p["ordered_roles"].index("ward"))
        self.assertGreater(p["ordered_roles"].index("inbox"), p["ordered_roles"].index("cli"))
        res = install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertEqual(res["state"], "INSTALLED_BYTES_VERIFIED")
        self.assertEqual(res["receipt_count"], 6)
        for role in ("cli", "ibal", "switchboard", "bins", "ward", "inbox"):
            self.assertTrue((Path(f.env["XDG_DATA_HOME"]) / f"xi-io/{role}/{role}.bin").exists())
        receipts = sorted((Path(f.env["XDG_STATE_HOME"]) / "xi-io/installer/bundles/core-test").glob("*.receipt.json"))
        self.assertEqual(len(receipts), 6)
        for item in reversed(receipts):
            rollback(item, f.env)
        for role in ("cli", "ibal", "switchboard", "bins", "ward", "inbox"):
            self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / f"xi-io/{role}/{role}.bin").exists())

    def test_six_product_baseline_mid_transaction_rollback_cleans_prior_applied(self):
        f = self.fixture()
        f.child("cli", fixture=False)
        f.child("ibal", depends_on=("cli",), fixture=False)
        f.child("switchboard", depends_on=("cli",), fixture=False)
        f.child("bins", depends_on=("cli",), fixture=False)
        f.child("ward", depends_on=("cli",), fixture=False)
        f.child("inbox", depends_on=("cli", "ward"), fixture=False)
        lock, digest = f.lock(fixture=False)
        with self.assertRaisesRegex(BundleError, "BUNDLE_APPLY_FAILED_ROLLED_BACK"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch, fail_after_product=3)
        # All products must have been rolled back cleanly
        for role in ("cli", "ibal", "switchboard", "bins", "ward", "inbox"):
            self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / f"xi-io/{role}/{role}.bin").exists())

    def test_two_process_overlapping_install_refused_via_cross_process_lock(self):
        f = self.fixture()
        f.child("cli")
        lock, digest = f.lock()
        barrier = mp.Queue()
        done = mp.Queue()
        p1 = mp.Process(target=_concurrency_worker, args=(lock, digest, f.env, barrier, done))
        p1.start()
        try:
            status = barrier.get(timeout=5)
            self.assertEqual(status, "LOCKED_AND_FETCHING")
            # Process 2 attempts concurrent install while Process 1 is in acquisition stage
            with self.assertRaisesRegex(BundleError, "BUNDLE_INSTALLATION_IN_PROGRESS"):
                install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        finally:
            done.put("RELEASE")
            p1.join(timeout=5)


    def test_shared_installer_source_blob_is_exact_not_a_second_kernel(self):
        source = (HERE / "kernel/xiio_installer/transaction.py").read_bytes()
        blob = hashlib.sha1(b"blob " + str(len(source)).encode() + b"\0" + source).hexdigest()
        self.assertEqual(blob, "32c0be53c51f96bc2b4cd4028a679cb0ddb1e5a2")

    def test_qualify_entire_bundle_before_first_download_or_install(self):
        f = self.fixture()
        f.child("cli")
        lock, digest = f.lock()
        fetched = []
        def attempted_fetch(url, output, limit):
            fetched.append(url)
            raise AssertionError("FETCH_BEFORE_FILESYSTEM_QUALIFICATION")
        from xiio_installer.transaction import TransactionError
        with patch("child_bundle.qualify_precommand_manifests",
                   side_effect=TransactionError("mock unsupported filesystem")):
            with self.assertRaisesRegex(BundleError, "BUNDLE_FILESYSTEM_UNQUALIFIED"):
                install_bundle(lock, approved_lock_sha256=digest, env=f.env,
                               fetch=attempted_fetch)
        self.assertEqual(fetched, [])
        self.assertFalse((Path(f.env["XDG_STATE_HOME"]) /
                          "xi-io/installer/bundles/core-test").exists())

    def test_ntfs_0664_refused_before_fetch_and_every_child_effect(self):
        f = self.fixture()
        f.child("cli")
        manifest_path = f.root / "cli.manifest.json"
        data = json.loads(manifest_path.read_text())
        data["payload"][0]["mode"] = "0755"
        manifest_path.write_text(json.dumps(data, sort_keys=True))
        f.rows[-1]["manifest_sha256"] = sha(manifest_path.read_bytes())
        lock, digest = f.lock()
        from xiio_installer import transaction as tx
        chmod = os.chmod
        fetched = []
        def ntfs_chmod(file, mode, *args, **kwargs):
            return chmod(file, 0o664 if mode == 0o755 else mode, *args, **kwargs)
        with patch.object(tx.os, "chmod", side_effect=ntfs_chmod):
            with self.assertRaisesRegex(BundleError, "BUNDLE_FILESYSTEM_UNQUALIFIED"):
                install_bundle(lock, approved_lock_sha256=digest, env=f.env,
                               fetch=lambda url, output, limit: fetched.append(url))
        self.assertEqual(fetched, [])
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/cli").exists())
        self.assertFalse((Path(f.env["XDG_STATE_HOME"]) /
                          "xi-io/installer/bundles/core-test").exists())


def _concurrency_worker(lock, digest, env, barrier, done):
    def slow_fetch(url, output, limit):
        barrier.put("LOCKED_AND_FETCHING")
        done.get(timeout=10)
        output.write_bytes(b"cli delivered\n")
    try:
        install_bundle(lock, approved_lock_sha256=digest, env=env, fetch=slow_fetch)
    except Exception as exc:
        barrier.put(f"ERROR: {exc}")


if __name__ == "__main__":
    unittest.main()
