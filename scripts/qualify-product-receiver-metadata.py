#!/usr/bin/env python3
"""Exercise donor metadata cases at the packaged HEX adapter, on an offline test host.

Pass --donor CHECKOUT, --deb DEV14.deb, and --media FOLDER LOCK_SHA256 for each
product. The shared HTTP harness expects HTTP statuses and an ingress callback.
HEX uses JSON on stdin/stdout, so only the donor's exported case data applies.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile


REPO = Path(__file__).resolve().parents[1]
DONOR = "e30a95f7319bb4c0b7bf53a9a2a1a7700de0ff1e"
HARNESS = "scripts/ibal/contract-qualification-harness.mjs"
BLOB = "c7e3e5d39cf2892b460dbccbd44add9d1071658c"
DEB_SHA256 = "30085a934390c7a5a25350091d9c1ce211ae45eb10030100b638584377157651"
REFUSAL = {"ok": False, "error": "PRODUCT_RECEIVER_FIELDS_INVALID"}

spec = importlib.util.spec_from_file_location("installed_folders", REPO / "scripts/verify-installed-product-folders.py")
bench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bench)


def exported_cases(checkout, work, node):
    git = ["git", "--no-replace-objects", "-C", str(checkout)]
    env = dict(os.environ, GIT_NO_LAZY_FETCH="1")
    refs = subprocess.check_output([*git, "rev-parse", "HEAD", f"HEAD:{HARNESS}"], env=env, text=True)
    bench.require(refs.splitlines() == [DONOR, BLOB], "Donor checkout or harness blob mismatch")
    # Load tracked imports from the pinned tree, independently of uncommitted work.
    scripts = work / "donor/scripts"
    scripts.mkdir(parents=True)
    archive = subprocess.check_output([*git, "archive", f"{DONOR}:scripts"], env=env)
    subprocess.run(["tar", "-xf", "-", "-C", str(scripts)], input=archive, check=True)
    script = (f"import {{DEFAULT_CALLER_INJECTION_VECTORS as cases}} from './{HARNESS}';"
              "process.stdout.write(JSON.stringify(cases));")
    cases = json.loads(subprocess.check_output([node, "--input-type=module", "-e", script], cwd=scripts.parent))
    bench.require(len(cases) == len({case["id"] for case in cases}) == 4
                  and all(isinstance(case["patch"], dict) and case["patch"] for case in cases),
                  "Incomplete donor case export")
    return cases


def snapshot(home):
    files = {}
    for path in [home, *home.rglob("*")]:
        st = path.lstat()
        content = None
        if stat.S_ISREG(st.st_mode):
            content = bench.digest(path.read_bytes())
        elif stat.S_ISLNK(st.st_mode):
            content = os.readlink(path)
        files[str(path.relative_to(home))] = (st.st_ino, st.st_mode, st.st_ctime_ns, content)
    return files


def request(adapter, fields):
    result = subprocess.run([sys.executable, "-I", "-B", str(adapter)], cwd=adapter.parent,
                            input=json.dumps(fields), text=True, check=True, capture_output=True, timeout=90)
    return json.loads(result.stdout)


def verify_receipt_entries(folder, profile, state):
    receipt_dir = state / "xi-io/installer/bundles" / profile["profile_id"]
    receipts = [bench.read(path) for path in receipt_dir.glob("*.receipt.json")]
    for product in profile["products"]:
        receipt, = [item for item in receipts if item["product_id"] == product["product_id"]]
        expected = sorted((e["destination_scope"], e["destination"], e["sha256"], int(e["mode"], 8))
                          for e in bench.read(folder / product["manifest"])["payload"])
        observed = sorted((e["destination_scope"], e["destination"], e["installed_sha256"], e["installed_mode"])
                          for e in receipt["entries"] if e["write_committed"] is True)
        bench.require(observed == expected and len(observed) == len(receipt["entries"]), "Receipt rows mismatch")


def qualify(folder, lock_sha, host, framework, node, adapter, cases):
    lock = folder / "bundle.lock.json"
    bench.require(bench.digest(lock.read_bytes()) == lock_sha, "Product lock digest mismatch")
    bench.require((folder / "payloads").is_dir(), "Offline product folder required")
    profile, root, _ = bench.prepare_admission(folder, framework, node)
    rows = bench.value_before_effect(folder, profile)
    context = request(adapter, {"action": "inspect"})["result"]["product_host"]
    inspect = dict(action="product_inspect", release_lock=str(lock), node=str(node), **context)
    review = request(adapter, inspect)["result"]
    bench.require(review["state"] == "PRODUCT_REVIEW_REQUIRED" and review["approved_lock_sha256"] == lock_sha
                  and review["release_generation"] == root["release_generation"], "Genuine review mismatch")
    apply = dict(inspect, action="product_apply", approved=True, review_digest=review["review_digest"])
    state_before = snapshot(host)
    for case in cases:
        for fields in (inspect, apply):
            patch = case["patch"]
            label = f"{case['id']} on {fields['action']}"
            bench.require(fields.keys().isdisjoint(patch), f"Non-additive metadata in {label}")
            bench.require(request(adapter, {**fields, **patch}) == REFUSAL, f"Wrong native refusal for {label}")
            bench.require(snapshot(host) == state_before, f"Host files changed after {label}")

    effect = request(adapter, apply)["result"]
    bench.require(effect["installed_bytes_verified"] is True and effect["approved_lock_sha256"] == lock_sha,
                  "Genuine apply failed")
    observed = bench.readback(profile, root, lock_sha, rows)
    verify_receipt_entries(folder, profile, Path(os.environ["XDG_STATE_HOME"]))
    return {"product": observed["product_id"], "generation": observed["release_generation"],
            "lock_sha256": lock_sha, "native_refusals": len(cases) * 2, "unchanged_host_snapshots": len(cases) * 2,
            "reopened_payloads": len(rows), "transaction_receipts": observed["transaction_count"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--donor", required=True, type=Path)
    parser.add_argument("--deb", required=True, type=Path)
    parser.add_argument("--media", required=True, nargs=2, action="append", metavar=("FOLDER", "LOCK_SHA256"))
    args = parser.parse_args()
    bench.require(bench.digest(args.deb.read_bytes()) == DEB_SHA256, "DEV14 Debian digest mismatch")
    node = Path(shutil.which("node")).resolve()
    with tempfile.TemporaryDirectory(prefix="hex-native-metadata-") as temp:
        work = Path(temp)
        cases = exported_cases(args.donor, work, node)
        subprocess.run(["dpkg-deb", "-x", str(args.deb), str(work / "package")], check=True)
        adapter = work / "package/usr/lib/XI-IO HEX DEV/adapter/installer_adapter.py"
        host = work / "home"
        host.mkdir(mode=0o700)
        os.environ["HOME"] = str(host)
        for key in ("DATA", "STATE", "CONFIG", "CACHE"):
            path = host / key.lower()
            path.mkdir(mode=0o700)
            os.environ[f"XDG_{key}_HOME"] = str(path)
        sentinel = host / "private-sentinel"
        original = os.urandom(32)
        sentinel.write_bytes(original)
        framework = bench.prepare_framework(REPO, work)
        products = []
        for index, (source, lock_sha) in enumerate(args.media):
            folder = work / f"media-{index}"
            shutil.copytree(Path(source), folder)
            products.append(qualify(folder, lock_sha, host, framework, node, adapter, cases))
        bench.require(sentinel.read_bytes() == original, "Private sentinel changed")
        print(json.dumps({"donor": DONOR, "harness_blob": BLOB, "case_ids": [case["id"] for case in cases],
                          "deb_sha256": DEB_SHA256, "adapter_sha256": bench.digest(adapter.read_bytes()),
                          "native_error": REFUSAL["error"], "disposable_framework_authority": True,
                          "private_sentinel_preserved": True, "products": products}, indent=2))


if __name__ == "__main__":
    main()
