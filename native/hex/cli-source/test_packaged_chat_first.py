#!/usr/bin/env python3
import hashlib, json, pathlib
ROOT=pathlib.Path(__file__).resolve().parent
SOURCE='923f3a656858366a45f5ec140326389920086fca'
EXPECTED={"src/xiio.mjs":{"sha256":"e3dab9c4b91891cfa243a9d72a28c15fbb63d9c6859782aec7a06473778f755b","size":153701},"src/file-edit-cas.mjs":{"sha256":"f96a15c095ef043d862e6ba77bb2b0ac1dcde90c040c414a68331b4b8e4e88f3","size":3788},"src/local-ops.mjs":{"sha256":"a3da965da21979620358dc54f6a72dc3be537b114f3e5b8f1acbb4c47b6155a5","size":6604},"src/runtime-integrity.mjs":{"sha256":"7c7100b6aa61a9055a35a47c94971c8080258e105e345853ba9bb97e27823536","size":12027},"config/service-catalog.json":{"sha256":"473a6e0d6fc2c7da21ed510906e9a85c4a9c22617b4db1f1f107e0482b75f30a","size":4064},"scripts/service-inventory.mjs":{"sha256":"4711d6603f759607e79cadc1031f8668ef27b393f25b408b9ecd5516ebc18204","size":7287},"scripts/reconcile-service-inventory.mjs":{"sha256":"eb20d7ef9cc8d50ca7c3cd1af016f76e4c2a7ddea4afb30d47d1695237a6845e","size":3960},"src/sdk-provider-state.mjs":{"sha256":"e83108fa0a87e91c450d4b5a613dc3b215eae47b21d29d8e812e562ffedac55e","size":9127},"src/sdk/audhd-command.mjs":{"sha256":"85b0adc068a51664992d0d1870b6c1deef133b1987fecb64c33f1098de43d147","size":22457},"src/sdk/tool-verb-fidelity.mjs":{"sha256":"a645b456395bac5c6d3881cfe76e54820e5fc6951d01f3c022ef90197e73412c","size":15812},"src/sdk/local-work-packet.mjs":{"sha256":"6efd7165ed89d716f512d8078369e9486009c2ea1be4cc9c122c82581d60a581","size":17802}}
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

