#!/usr/bin/env python3
import hashlib, json, pathlib
ROOT=pathlib.Path(__file__).resolve().parent
manifest=json.loads((ROOT/"packaged-source.json").read_text())
assert manifest["schema"]=="xiio.cli.packaged-source/v1"
SOURCE=manifest["source_sha"]
EXPECTED=manifest["files"]
assert len(SOURCE)==40 and all(c in "0123456789abcdef" for c in SOURCE)
assert EXPECTED
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
assert current["local_payload_modifications"] is False  # all seven files match canonical CLI owner blobs
installer=(ROOT/"install.mjs").read_text()
assert "input: '10\\n'" in installer  # owner menu exit smoke, not an inferred chat-first prompt
assert "input: '/exit\\n'" not in installer
assert source["offline_installer_successor"]["sha256"]==hashlib.sha256((ROOT/"install.mjs").read_bytes()).hexdigest()
runtime=(ROOT/"src/xiio.mjs").read_text()
assert "new URL(operation==='models'?engine.model_discovery:'/api/chat',base).href" in runtime
assert "if(cmd==='/exit')" in runtime
print(json.dumps({"schema":"xiio.hex.cli-payload-current/v1","source_sha":SOURCE,"files":len(EXPECTED),"chat_first_payload":False,"menu_entry":True,"offline_installer":True,"status":"PASS"},sort_keys=True))

