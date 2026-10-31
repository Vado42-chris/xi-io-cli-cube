#!/usr/bin/env python3
import hashlib, json, pathlib
ROOT=pathlib.Path(__file__).resolve().parent
SOURCE='1d7543a3cf33a3c2d83363825e120a31e28a8bdf'
EXPECTED={"src/xiio.mjs":{"sha256":"ac1df57853538be1b7fd2af6746a77b06754ed3cef437d0fb06c1c34f84c15c7","size":133680},"src/file-edit-cas.mjs":{"sha256":"f96a15c095ef043d862e6ba77bb2b0ac1dcde90c040c414a68331b4b8e4e88f3","size":3788},"src/local-ops.mjs":{"sha256":"a3da965da21979620358dc54f6a72dc3be537b114f3e5b8f1acbb4c47b6155a5","size":6604},"src/runtime-integrity.mjs":{"sha256":"d50a8e7050e8920c4b8afd2c6e9f074b344bf70bc94d1b38f02dd6989b6d82a9","size":11223},"config/service-catalog.json":{"sha256":"473a6e0d6fc2c7da21ed510906e9a85c4a9c22617b4db1f1f107e0482b75f30a","size":4064},"scripts/service-inventory.mjs":{"sha256":"4711d6603f759607e79cadc1031f8668ef27b393f25b408b9ecd5516ebc18204","size":7287},"scripts/reconcile-service-inventory.mjs":{"sha256":"eb20d7ef9cc8d50ca7c3cd1af016f76e4c2a7ddea4afb30d47d1695237a6845e","size":3960},"src/sdk-provider-state.mjs":{"sha256":"e83108fa0a87e91c450d4b5a613dc3b215eae47b21d29d8e812e562ffedac55e","size":9127}}
manifest=json.loads((ROOT/"packaged-source.json").read_text())
assert manifest["schema"]=="xiio.cli.packaged-source/v1"
assert manifest["source_sha"]==SOURCE
assert manifest["files"]==EXPECTED
for rel,meta in EXPECTED.items():
    data=(ROOT/rel).read_bytes()
    assert len(data)==meta["size"], rel
    assert hashlib.sha256(data).hexdigest()==meta["sha256"], rel
source=json.loads((ROOT/"SOURCE.json").read_text())
current=source["current_packaged_payload"]
assert current["repository"]=="Vado42-chris/xi-io-cli"
assert current["ref"]==SOURCE
assert current["manifest"]=="packaged-source.json"
assert current["files"]==EXPECTED
assert current["local_payload_modifications"] is False
installer=(ROOT/"install.mjs").read_text()
assert "input: '/exit\\n'" in installer
assert "input: '10\\n'" not in installer
assert source["offline_installer_successor"]["sha256"]==hashlib.sha256((ROOT/"install.mjs").read_bytes()).hexdigest()
runtime=(ROOT/"src/xiio.mjs").read_text()
assert "127.0.0.1:11434/api/chat" in runtime
assert "/menu" in runtime
print(json.dumps({"schema":"xiio.hex.cli-payload-current/v1","source_sha":SOURCE,"files":len(EXPECTED),"chat_first_payload":True,"offline_installer":True,"status":"PASS"},sort_keys=True))

