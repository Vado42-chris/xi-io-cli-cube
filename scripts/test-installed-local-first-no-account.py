#!/usr/bin/env python3
"""Disposable Linux installed-package test. No XI-IO user/account/remote service."""
import json, os, pathlib, subprocess, tempfile, shutil

root=pathlib.Path(tempfile.mkdtemp(prefix="xiio-local-first-",dir=os.environ["RUNNER_TEMP"]))
for n in ("home","config","state","data","cache","prefix"):
    (root/n).mkdir(mode=0o700)
marker=root/"config"/"existing-user-data"
marker.write_bytes(b"PRESERVE UNRELATED USER DATA\n")
dev=root/"config"/"xi-io"/"device.json"
key=root/"config"/"xi-io"/"device-key.pem"
env={k:v for k,v in os.environ.items() if k in ("PATH","LANG","LC_ALL")}
env.update({"HOME":str(root/"home"),"XDG_CONFIG_HOME":str(root/"config"),
    "XDG_DATA_HOME":str(root/"data"),"XDG_STATE_HOME":str(root/"state"),
    "XDG_CACHE_HOME":str(root/"cache"),"GH_CONFIG_DIR":str(root/"home"/"no-gh-identity")})
adapter="/usr/lib/XI-IO HEX DEV/adapter/installer_adapter.py"
def call(label,req,ok=True):
    result=subprocess.run(["/usr/bin/python3","-I","-B",adapter],
        input=json.dumps(req),text=True,capture_output=True,env=env,
        cwd="/usr/lib/XI-IO HEX DEV/adapter",timeout=120)
    assert result.returncode==0,(label,result.stderr[-500:])
    data=json.loads(result.stdout)
    assert data.get("ok") is ok,(label,data)
    assert marker.read_bytes()==b"PRESERVE UNRELATED USER DATA\n",label
    assert not dev.exists() and not key.exists(),(label,"unexpected identity/enrollment")
    return data.get("result",data)
observed=call("inspect-no-account",{"action":"inspect"})
assert observed["connection_prerequisites"]["device_identity"]["state"]=="NOT_OBSERVED_AT_KNOWN_LOCATION"
assert observed["connection_prerequisites"]["device_identity"]["authority"]=="NOT_INFERRED"
node=str(pathlib.Path(shutil.which("node")).resolve())
prefix=root/"prefix"/"cli"
def prepare():
    result=call("prepare",{"action":"prepare","prefix":str(prefix),"node":node,"components":["cli"]})
    assert result["phase"]=="PREPARED_NOT_INSTALLED"
    return result
first=prepare()
call("deny-unapproved",{"action":"apply","plan_id":first["plan_id"],
    "approval_digest":first["approval_digest"],"approved":False},False)
done=call("apply",{"action":"apply","plan_id":first["plan_id"],
    "approval_digest":first["approval_digest"],"approved":True})
assert done["phase"]=="INSTALLED_READBACK_VERIFIED"
assert done["connection_state"]=="CONFIGURATION_REQUIRED" and done["connected"] is False
def cli(*args):
    result=subprocess.run([str(prefix/"bin"/"xi-io-cli"),*args],
        capture_output=True,text=True,env=env,timeout=30)
    return result.returncode,json.loads(result.stdout)
exitcode,version=cli("version")
assert exitcode==0 and version["integrity_verified"] is True
exitcode,helpinfo=cli("help")
assert exitcode==0 and helpinfo["state"]=="PASS"
exitcode,who=cli("whoami")
assert who["state"]=="UNSET",who
exitcode,connect=cli("connect")
assert connect["state"]=="CONFIGURATION_REQUIRED" and connect["connected"] is False
old=(prefix/"current").read_text()
call("first-readback",{"action":"readback","plan_id":first["plan_id"]})
second=prepare()
done=call("update",{"action":"apply","plan_id":second["plan_id"],
    "approval_digest":second["approval_digest"],"approved":True})
assert done["phase"]=="INSTALLED_READBACK_VERIFIED"
assert (prefix/"current").read_text()!=old
rolled=call("rollback",{"action":"rollback","plan_id":second["plan_id"],
    "approval_digest":second["approval_digest"],"approved":True})
assert rolled["phase"]=="ROLLED_BACK" and (prefix/"current").read_text()==old
call("rollback-readback",{"action":"readback","plan_id":second["plan_id"]})
print("LOCAL_FIRST_NO_ACCOUNT_PASS; CLIS_LOCAL_ACTIVE; REMOTE_ONLY_GATED; ROLLBACK_PASS")
