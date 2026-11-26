use crate::protocol::InstallerRequest;
use serde_json::{json, Value};
use std::{io::{Read, Write}, path::PathBuf, process::{Command, Stdio}, sync::{mpsc, Arc, Mutex}, thread, time::{Duration, Instant}};
const MAX_REQUEST: usize = 16 * 1024;
const MAX_OUTPUT: usize = 2 * 1024 * 1024;
pub type Gate = Arc<Mutex<()>>;
fn failure(error: &str) -> Value { json!({"ok":false,"error":error}) }
fn uncertain(error: &str) -> Value {
    json!({"ok":true,"result":{"phase":"APPLY_OUTCOME_UNCERTAIN","do_not_retry":true,"error":error,"native_process_may_still_be_running":true}})
}
fn local_desktop_value(key:&str,value:&str,runtime:Option<&str>)->bool {
    if value.is_empty() || value.len()>4096 || value.contains('\0') {return false}
    match key {
        "DISPLAY"=>value.strip_prefix(':').map(|tail|{
            let parts:Vec<&str>=tail.split('.').collect();
            parts.len()<=2 && parts.iter().all(|p|!p.is_empty()&&p.len()<=5&&p.bytes().all(|b|b.is_ascii_digit()))
        }).unwrap_or(false),
        "WAYLAND_DISPLAY"=>value.len()<=128 && !value.starts_with('.') && value.bytes().all(|b|b.is_ascii_alphanumeric()||b"._-".contains(&b)),
        "XAUTHORITY"=>value.starts_with('/')&&!value.split('/').any(|p|p=="."||p==".."),
        "DBUS_SESSION_BUS_ADDRESS"=>runtime.map(|r|r.starts_with('/')&&!r.contains('\0')&&value==format!("unix:path={}/bus",r.trim_end_matches('/'))).unwrap_or(false),
        _=>false,
    }
}
fn bounded_reader<R: Read + Send + 'static>(mut input: R) -> mpsc::Receiver<Result<Vec<u8>, ()>> {
    let (tx,rx)=mpsc::channel();
    thread::spawn(move || { let mut bytes=Vec::new(); let result=input.by_ref().take((MAX_OUTPUT+1) as u64).read_to_end(&mut bytes).map_err(|_|());
        let _=tx.send(if result.is_ok() && bytes.len()<=MAX_OUTPUT {Ok(bytes)} else {Err(())}); }); rx
}
/// A timeout reports uncertain state WITHOUT killing the transaction. Its gate
/// remains held by the tracker until the actual subprocess exits. No retry races.
pub fn execute(request: InstallerRequest, adapter: PathBuf, home: PathBuf, gate: Gate) -> Value {
    execute_deadline(request, adapter, home, gate, Duration::from_secs(120))
}
fn execute_deadline(request: InstallerRequest, adapter: PathBuf, home: PathBuf, gate: Gate, timeout:Duration) -> Value {
    if let Err(e)=request.validate() {return failure(e)}
    let bytes=match serde_json::to_vec(&request) {Ok(b) if b.len()<=MAX_REQUEST=>b,_=>return failure("REQUEST_TOO_LARGE")};
    let request_meta=serde_json::to_value(&request).unwrap_or(Value::Null);
    let launching_cli=matches!(&request,InstallerRequest::LaunchCli{..});
    let (tx,rx)=mpsc::channel();
    thread::spawn(move || {
        let _guard=match gate.try_lock() {Ok(g)=>g,Err(_)=>{let _=tx.send(uncertain("NATIVE_REQUEST_BUSY_DO_NOT_RETRY"));return}};
        let mut cmd = Command::new("/usr/bin/python3");
        cmd.arg("-I").arg("-B").arg(&adapter);
        cmd.env_clear()
            .env("HOME", &home)
            .env("LANG", "C.UTF-8")
            .current_dir(adapter.parent().unwrap())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Bounded, validated environment handoff: preserve explicit sandbox XDG base directories
        for var in &["XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR"] {
            if let Ok(val) = std::env::var(var) {
                if val.starts_with('/') && !val.contains('\0') {
                    cmd.env(var, val);
                }
            }
        }

        // Only this explicit local launch receives desktop routing. Installation
        // and readback retain the existing cleared environment; no shell state,
        // provider credentials or remote display address is forwarded.
        if launching_cli {
            let runtime=std::env::var("XDG_RUNTIME_DIR").ok();
            for var in ["DISPLAY","WAYLAND_DISPLAY","XAUTHORITY","DBUS_SESSION_BUS_ADDRESS"] {
                if let Ok(value)=std::env::var(var) {
                    if local_desktop_value(var,&value,runtime.as_deref()) {cmd.env(var,value);}
                }
            }
        }

        let mut child = match cmd.spawn() {
            Ok(c)=>c,Err(_)=>{let _=tx.send(failure("FIXED_PYTHON_ADAPTER_NOT_STARTED"));return}
        };
        let stdout=bounded_reader(child.stdout.take().unwrap());
        let stderr=bounded_reader(child.stderr.take().unwrap());
        let start=Instant::now();
        let (write_tx,write_rx)=mpsc::channel();
        let stdin=child.stdin.take();
        thread::spawn(move || {
            let ok=stdin.map(|mut s|s.write_all(&bytes).is_ok()).unwrap_or(false);
            let _=write_tx.send(ok);
        });
        let mut reported=false;
        loop {
            match child.try_wait() {
                Ok(Some(status))=>{
                    let write_ok=write_rx.recv_timeout(Duration::from_secs(2)).unwrap_or(false);
                    let out=stdout.recv_timeout(Duration::from_secs(2));
                    let _=stderr.recv_timeout(Duration::from_secs(2)); // Never forward raw stderr.
                    if !reported {
                        let response=match out {
                            Ok(Ok(b)) if write_ok && status.success()=>match serde_json::from_slice::<Value>(&b) {
                                Ok(v) if v.get("ok").and_then(Value::as_bool).is_some()
                                    && (v["ok"]==false || v.get("result").map(Value::is_object).unwrap_or(false))=>v,
                                _=>uncertain("ADAPTER_RESPONSE_UNREADABLE_CHECK_SAVED_STATE")},
                            _=>uncertain("ADAPTER_EXIT_UNCERTAIN_CHECK_SAVED_STATE")};
                        let _=tx.send(response);
                    }
                    break
                },
                Ok(None)=>{},
                Err(_)=>{if !reported {let _=tx.send(uncertain("PROCESS_CUSTODY_UNKNOWN_DO_NOT_RETRY"));reported=true;}
                    // Keep serialization held; never infer no effects from lost custody.
                }
            }
            if !reported && start.elapsed()>=timeout {
                let _=tx.send(uncertain("NATIVE_REQUEST_TIMEOUT_PROCESS_RETAINED_DO_NOT_RETRY"));reported=true;
            }
            thread::sleep(Duration::from_millis(100));
        }
    });
    let mut response=rx.recv().unwrap_or_else(|_|uncertain("NATIVE_TRACKER_DISCONNECTED_DO_NOT_RETRY"));
    if response["result"]["do_not_retry"]==true {
        if let Some(id)=request_meta.get("plan_id") {response["result"]["plan_id"]=id.clone();}
        if let Some(id)=request_meta.get("proof_id") {response["result"]["proof_id"]=id.clone();}
        if request_meta["action"]=="safe_task_apply" {response["result"]["phase"]="SAFE_TASK_OUTCOME_UNCERTAIN".into();}
        if request_meta["action"]=="apply_repair" {response["result"]["phase"]="LAUNCHER_REPAIR_OUTCOME_UNCERTAIN".into();response["result"]["kind"]="launcher_repair".into();}
        if request_meta["action"]=="rollback" {response["result"]["phase"]="ROLLBACK_OUTCOME_UNCERTAIN".into();}
        if request_meta["action"]=="launch_cli" {response["result"]["phase"]="CLI_LAUNCH_OUTCOME_UNCERTAIN".into();}
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn launch_desktop_environment_is_local_and_finite() {
        assert!(local_desktop_value("DISPLAY",":0.0",None));
        assert!(!local_desktop_value("DISPLAY","other-host:0",None));
        assert!(!local_desktop_value("DISPLAY",":0.1.2",None));
        assert!(local_desktop_value("WAYLAND_DISPLAY","wayland-0",None));
        assert!(!local_desktop_value("WAYLAND_DISPLAY","/tmp/other",None));
        assert!(local_desktop_value("XAUTHORITY","/run/user/1000/.auth",None));
        assert!(!local_desktop_value("XAUTHORITY","../other",None));
        assert!(local_desktop_value("DBUS_SESSION_BUS_ADDRESS","unix:path=/run/user/1000/bus",Some("/run/user/1000")));
        assert!(!local_desktop_value("DBUS_SESSION_BUS_ADDRESS","tcp:host=other",Some("/run/user/1000")));
        assert!(!local_desktop_value("LD_PRELOAD","/tmp/library.so",None));
    }
    #[test] fn desktop_handoff_is_only_for_explicit_cli_launch() {
        let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root=std::env::temp_dir().join(format!("hex-launch-env-{}-{stamp}",std::process::id()));
        std::fs::create_dir(&root).unwrap();
        let script=root.join("adapter.py");
        std::fs::write(&script,"import json,os,sys\nsys.stdin.read()\nprint(json.dumps({'ok':True,'result':{'display':os.environ.get('DISPLAY')}}))\n").unwrap();
        let previous=std::env::var_os("DISPLAY");std::env::set_var("DISPLAY",":77");
        let gate=Arc::new(Mutex::new(()));
        let request=InstallerRequest::LaunchCli{plan_id:"a".repeat(32),approval_digest:"b".repeat(64),approved:true,workspace:root.to_string_lossy().into_owned()};
        let launched=execute_deadline(request,script.clone(),root.clone(),gate.clone(),Duration::from_secs(5));
        let inspected=execute_deadline(InstallerRequest::Inspect{plan_id:None},script,root.clone(),gate,Duration::from_secs(5));
        match previous {Some(value)=>std::env::set_var("DISPLAY",value),None=>std::env::remove_var("DISPLAY")}
        std::fs::remove_dir_all(root).unwrap();
        assert_eq!(launched["result"]["display"],":77");
        assert_eq!(inspected["result"]["display"],Value::Null);
    }
    #[test] fn bounded_output_reader() {
        assert_eq!(bounded_reader(std::io::Cursor::new(b"{}".to_vec())).recv().unwrap().unwrap(), b"{}");
        assert!(bounded_reader(std::io::Cursor::new(vec![b'x';MAX_OUTPUT+1])).recv().unwrap().is_err());
    }
    #[test] fn uncertainty_is_never_success_or_retryable() {
        let v=uncertain("TEST_TIMEOUT");
        assert_eq!(v["result"]["do_not_retry"],true);
        assert_eq!(v["result"]["phase"],"APPLY_OUTCOME_UNCERTAIN");
        assert_eq!(v["result"]["native_process_may_still_be_running"],true);
    }
    #[test] fn bad_request_never_starts_python() {
        let v=execute(InstallerRequest::Readback{plan_id:"../bad".into()},PathBuf::from("/does-not-exist"),PathBuf::from("/does-not-exist"),Arc::new(Mutex::new(())));
        assert_eq!(v["ok"],false);assert_eq!(v["error"],"INVALID_INSTALLER_REQUEST");
    }
    #[test] fn stalled_stdin_does_not_delay_timeout_or_release_gate() {
        let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root=std::env::temp_dir().join(format!("hex-transport-{}-{stamp}",std::process::id()));
        std::fs::create_dir(&root).unwrap();
        let script=root.join("adapter.py");
        std::fs::write(&script,"import time,sys\ntime.sleep(0.6)\nsys.stdin.read()\nprint('{\"ok\":true,\"result\":{}}')\n").unwrap();
        let gate=Arc::new(Mutex::new(()));
        // Large legal request: a child that does not read can fill a pipe. The
        // timer/tracker must stay independent from the blocked writer.
        let req=InstallerRequest::Prepare{
            prefix:format!("/{}","x".repeat(4090)),
            node:format!("/{}","y".repeat(4090)),
            components:vec!["cli".into()],
            permission_profile:serde_json::json!({
                "schema":"xiio.hex.permission-profile/v1",
                "profile_id":"local-standard",
                "capabilities":["install_files"],
                "service_scopes":[],
                "update_policy":"notify",
                "central_updates":false,
                "remote_access":false,
                "revoked":false
            })
        };
        let start=Instant::now();
        let response=execute_deadline(req,script,root.clone(),gate.clone(),Duration::from_millis(20));
        assert_eq!(response["result"]["do_not_retry"],true);
        assert!(start.elapsed()<Duration::from_millis(500));
        assert!(gate.try_lock().is_err(),"timeout must retain custody of running child");
        let deadline=Instant::now()+Duration::from_secs(4);
        loop {if gate.try_lock().is_ok(){break} assert!(Instant::now()<deadline,"child must exit normally without forced kill");thread::sleep(Duration::from_millis(20));}
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test] fn xdg_environment_handoff_is_forwarded_when_valid() {
        let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root=std::env::temp_dir().join(format!("hex-transport-xdg-{}-{stamp}",std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let target_state=root.join("sandbox-state");
        std::fs::create_dir_all(&target_state).unwrap();
        let script=root.join("adapter.py");
        std::fs::write(&script,"import os,sys\ns=os.environ.get('XDG_STATE_HOME','')\nprint('{\"ok\":true,\"result\":{\"xdg_state\":\"'+s+'\"}}')\n").unwrap();
        let gate=Arc::new(Mutex::new(()));
        let req=InstallerRequest::Readback{plan_id:"0123456789abcdef0123456789abcdef".into()};
        std::env::set_var("XDG_STATE_HOME", &target_state);
        let response=execute_deadline(req,script,root.clone(),gate,Duration::from_secs(5));
        std::env::remove_var("XDG_STATE_HOME");
        assert_eq!(response["ok"], true);
        assert_eq!(response["result"]["xdg_state"], target_state.to_str().unwrap());
        std::fs::remove_dir_all(root).unwrap();
    }

}

