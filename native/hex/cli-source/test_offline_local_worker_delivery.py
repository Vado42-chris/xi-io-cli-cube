#!/usr/bin/env python3
"""Disposable install + update + hostile payload + hotfolder stage for local-worker tip."""
import hashlib, json, os, pathlib, shutil, subprocess, tempfile

R = pathlib.Path(__file__).resolve().parent
HEX = R.parent
SHA = json.loads((R / "packaged-source.json").read_text())["source_sha"]
node = shutil.which("node")
assert node and SHA == "f2626cae872f191e980ecdfb681485f2d9e67198", SHA


def digest(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


with tempfile.TemporaryDirectory(prefix="xiio-hex-lwh-") as d:
    t = pathlib.Path(d)
    (t / "home").mkdir()
    (t / "bin").mkdir()
    env = {
        **os.environ,
        "HOME": str(t / "home"),
        "XIIO_CONFIG_DIR": str(t / "config"),
        "PATH": str(t / "bin") + ":" + os.environ["PATH"],
    }

    def install(src=R, prefix=None, bin_dir=None):
        prefix = prefix or (t / "prefix")
        bin_dir = bin_dir or (t / "bin")
        return subprocess.run(
            [node, str(R / "install.mjs"), "--packaged-source", str(src), "--ref", SHA, "--prefix", str(prefix), "--bin-dir", str(bin_dir)],
            env=env,
            capture_output=True,
            text=True,
            timeout=90,
        )

    # Fresh disposable install
    first = install()
    assert first.returncode == 0, first.stdout + first.stderr
    a = json.loads(first.stdout)
    assert a["state"] == "PASS" and a["source_sha"] == SHA
    g1 = (t / "prefix/current").read_text().strip()
    assert (t / "prefix/versions" / g1 / "src/sdk/local-worker-host.mjs").is_file()
    assert (t / "prefix/versions" / g1 / "src/sdk/qualified-command-executor.mjs").is_file()
    assert (t / "prefix/versions" / g1 / "config/batches/starter-regression-20261031.json").is_file()

    # Preserve user settings across update generation
    (t / "config").mkdir(exist_ok=True)
    sentinel = t / "config/user-preserved.txt"
    sentinel.write_text("keep user choices\n")

    # Same tip → new generation (update path)
    second = install()
    assert second.returncode == 0, second.stdout + second.stderr
    g2 = (t / "prefix/current").read_text().strip()
    assert g2 != g1
    assert (t / "prefix/previous").read_text().strip() == g1
    assert sentinel.read_text() == "keep user choices\n"

    # Rollback retains task/settings custody
    back = subprocess.run([str(t / "bin/xi-io-cli"), "rollback"], env=env, capture_output=True, text=True, timeout=30)
    assert back.returncode == 0, back.stdout + back.stderr
    assert (t / "prefix/current").read_text().strip() == g1
    assert sentinel.read_text() == "keep user choices\n"

    version = subprocess.run([str(t / "bin/xi-io-cli"), "version"], env=env, capture_output=True, text=True, timeout=30)
    v = json.loads(version.stdout)
    assert version.returncode == 0 and v.get("integrity_verified") and v["source_sha"] == SHA

    # Tampered / incomplete payload refused; current preserved
    before = (t / "prefix/current").read_bytes()
    bad = t / "bad"
    shutil.copytree(R, bad)
    (bad / "src/sdk/local-worker-host.mjs").write_text("tampered\n")
    deny = install(bad)
    assert deny.returncode != 0
    assert (t / "prefix/current").read_bytes() == before

    shutil.rmtree(bad)
    shutil.copytree(R, bad)
    m = json.loads((bad / "packaged-source.json").read_text())
    del m["files"]["src/sdk/local-worker-host.mjs"]
    (bad / "packaged-source.json").write_text(json.dumps(m))
    deny2 = install(bad)
    assert deny2.returncode != 0
    assert (t / "prefix/current").read_bytes() == before

    # Interrupted / incomplete hotfolder
    hot = t / "hotfolder"
    shutil.copytree(R, hot)
    (hot / ".partial").write_text("download interrupted\n")
    stage = t / "stage"
    lkg = t / "lkg.json"
    incomplete = subprocess.run(
        [
            "python3",
            str(HEX / "hotfolder-update-consumer.py"),
            "--hotfolder",
            str(hot),
            "--stage-dir",
            str(stage),
            "--lkg-pointer",
            str(lkg),
            "--expect-source-sha",
            SHA,
            "--consume",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert incomplete.returncode != 0
    assert json.loads(incomplete.stdout)["reason"] == "INCOMPLETE_PAYLOAD"

    (hot / ".partial").unlink()
    # Stale receipt / wrong expect sha
    stale = subprocess.run(
        [
            "python3",
            str(HEX / "hotfolder-update-consumer.py"),
            "--hotfolder",
            str(hot),
            "--stage-dir",
            str(stage),
            "--lkg-pointer",
            str(lkg),
            "--expect-source-sha",
            "89b9c418f6e161d9864bf891fd665b6a18f00dd2",
            "--consume",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert stale.returncode != 0
    assert "VERIFY_FAILED" in stale.stdout

    ok = subprocess.run(
        [
            "python3",
            str(HEX / "hotfolder-update-consumer.py"),
            "--hotfolder",
            str(hot),
            "--stage-dir",
            str(stage),
            "--lkg-pointer",
            str(lkg),
            "--expect-source-sha",
            SHA,
            "--consume",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert ok.returncode == 0, ok.stdout + ok.stderr
    staged = json.loads(ok.stdout)
    assert staged["state"] == "STAGED_NOT_ACTIVATED"
    assert staged["source_sha"] == SHA
    assert (stage / "src/sdk/local-worker-host.mjs").is_file()
    pointer = json.loads(lkg.read_text())
    assert pointer["state"] == "STAGED_NOT_ACTIVATED"
    assert pointer["custody_not_rolled_with_code"] is True

    # Activate from staged tree into a second disposable prefix (user-authorized path)
    prefix2 = t / "prefix2"
    bin2 = t / "bin2"
    bin2.mkdir()
    activated = install(stage, prefix=prefix2, bin_dir=bin2)
    assert activated.returncode == 0, activated.stdout + activated.stderr
    cli2 = bin2 / "xi-io-cli"
    ws = t / "ws"
    ws.mkdir()
    help_out = subprocess.run([str(cli2), "local-worker", "status", "--root", str(ws)], env=env, capture_output=True, text=True, timeout=30)
    # Missing progress is honest MISSING, proves command exists in installed generation
    assert help_out.returncode in (0, 2), help_out.stdout + help_out.stderr
    status = json.loads(help_out.stdout)
    assert status["schema"] == "xiio.cli.local-worker-progress/v1"

    print(
        json.dumps(
            {
                "schema": "xiio.hex.offline-local-worker-delivery-proof/v1",
                "state": "PASS",
                "source_sha": SHA,
                "payload_files": len(json.loads((R / "packaged-source.json").read_text())["files"]),
                "fresh_install": True,
                "update_new_generation": True,
                "rollback_preserves_settings": True,
                "tampered_refused": True,
                "incomplete_hotfolder_refused": True,
                "stale_expect_refused": True,
                "hotfolder_staged_not_activated": True,
                "activated_from_stage_disposable": True,
                "local_worker_command_present": True,
                "production_not_overwritten": True,
                "installed_on": "DISPOSABLE_ONLY",
            },
            indent=2,
        )
    )
