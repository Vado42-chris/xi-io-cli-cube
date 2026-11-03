use serde_json::{json, Value};
use std::{fs, io::Write, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};
use tauri::{Manager, WebviewWindow};

const MAX_SOURCE_BYTES: usize = 64 * 1024;
const FILE_NAME: &str = "snap55-workbench.json";

fn validate_source(source:&str)->Result<Value,String>{
    if source.is_empty() || source.len()>MAX_SOURCE_BYTES { return Err("SNAP55_STATE_SOURCE_SIZE_INVALID".into()); }
    let value:Value=serde_json::from_str(source).map_err(|_|"SNAP55_STATE_JSON_INVALID")?;
    if !value.is_object(){return Err("SNAP55_STATE_OBJECT_REQUIRED".into())}
    Ok(value)
}
fn ensure_root(root:&Path)->Result<(),String>{
    fs::create_dir_all(root).map_err(|_|"SNAP55_STATE_ROOT_CREATE_FAILED")?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root,fs::Permissions::from_mode(0o700)).map_err(|_|"SNAP55_STATE_ROOT_MODE_FAILED")?;
    }
    Ok(())
}
fn state_file(root:&Path)->PathBuf{root.join(FILE_NAME)}
fn save_at(root:&Path,source:&str)->Result<Value,String>{
    validate_source(source)?;
    ensure_root(root)?;
    let target=state_file(root);
    if target.is_symlink(){return Err("SNAP55_STATE_SYMLINK_FORBIDDEN".into())}
    let stamp=SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_|"SNAP55_STATE_CLOCK_FAILED")?.as_millis();
    let tmp=root.join(format!(".snap55-workbench.{}.{}.tmp",std::process::id(),stamp));
    let payload=json!({"schema":"xiio.hex.snap55-state/v1","source":source});
    let bytes=serde_json::to_vec_pretty(&payload).map_err(|_|"SNAP55_STATE_SERIALIZE_FAILED")?;
    let mut options=fs::OpenOptions::new();options.write(true).create_new(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut file=options.open(&tmp).map_err(|_|"SNAP55_STATE_TEMP_CREATE_FAILED")?;
    file.write_all(&bytes).map_err(|_|"SNAP55_STATE_WRITE_FAILED")?;
    file.write_all(b"\n").map_err(|_|"SNAP55_STATE_WRITE_FAILED")?;
    file.sync_all().map_err(|_|"SNAP55_STATE_SYNC_FAILED")?;
    drop(file);
    fs::rename(&tmp,&target).map_err(|_|"SNAP55_STATE_COMMIT_FAILED")?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&target,fs::Permissions::from_mode(0o600)).map_err(|_|"SNAP55_STATE_FILE_MODE_FAILED")?;
    }
    let read=load_at(root)?;
    if read.get("source").and_then(Value::as_str)!=Some(source){return Err("SNAP55_STATE_READBACK_MISMATCH".into())}
    Ok(json!({"state":"SAVED_READBACK_VERIFIED","bytes":source.len(),"source":source}))
}
fn load_at(root:&Path)->Result<Value,String>{
    let target=state_file(root);
    if !target.exists(){return Ok(json!({"state":"NOT_SAVED","source":Value::Null}))}
    if target.is_symlink() || !target.is_file(){return Err("SNAP55_STATE_FILE_UNTRUSTED".into())}
    let meta=target.metadata().map_err(|_|"SNAP55_STATE_METADATA_UNREADABLE")?;
    if meta.len()>(MAX_SOURCE_BYTES as u64+4096){return Err("SNAP55_STATE_FILE_TOO_LARGE".into())}
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        if meta.permissions().mode() & 0o077 != 0{return Err("SNAP55_STATE_FILE_PERMISSIONS_INVALID".into())}
    }
    let doc:Value=serde_json::from_slice(&fs::read(&target).map_err(|_|"SNAP55_STATE_READ_FAILED")?)
        .map_err(|_|"SNAP55_STATE_FILE_JSON_INVALID")?;
    if doc.get("schema").and_then(Value::as_str)!=Some("xiio.hex.snap55-state/v1"){return Err("SNAP55_STATE_SCHEMA_INVALID".into())}
    let source=doc.get("source").and_then(Value::as_str).ok_or("SNAP55_STATE_SOURCE_MISSING")?;
    validate_source(source)?;
    Ok(json!({"state":"LOADED_READBACK_VERIFIED","bytes":source.len(),"source":source}))
}
fn clear_at(root:&Path)->Result<Value,String>{
    let target=state_file(root);
    if target.is_symlink(){return Err("SNAP55_STATE_SYMLINK_FORBIDDEN".into())}
    match fs::remove_file(&target){Ok(())=>{},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},Err(_)=>return Err("SNAP55_STATE_CLEAR_FAILED".into())}
    if target.exists(){return Err("SNAP55_STATE_CLEAR_READBACK_FAILED".into())}
    Ok(json!({"state":"CLEARED_READBACK_VERIFIED"}))
}

#[tauri::command]
pub fn snap55_state(app:tauri::AppHandle,window:WebviewWindow,action:String,source:Option<String>)->Result<Value,String>{
    crate::local_caller(&window)?;
    let root=app.path().app_local_data_dir().map_err(|_|"SNAP55_STATE_APP_DATA_UNAVAILABLE")?.join("workbench");
    match action.as_str(){
        "load"=>{if source.is_some(){return Err("SNAP55_LOAD_SOURCE_FORBIDDEN".into())}load_at(&root)},
        "save"=>save_at(&root,source.as_deref().ok_or("SNAP55_SAVE_SOURCE_REQUIRED")?),
        "clear"=>{if source.is_some(){return Err("SNAP55_CLEAR_SOURCE_FORBIDDEN".into())}clear_at(&root)},
        _=>Err("SNAP55_STATE_ACTION_INVALID".into())
    }
}

#[cfg(test)]
mod tests{
    use super::*;
    fn temp_root(name:&str)->PathBuf{
        std::env::temp_dir().join(format!("xiio-snap55-{}-{}-{}",name,std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()))
    }
    #[test] fn save_load_clear_roundtrip(){
        let root=temp_root("roundtrip");
        let source=r#"{"questions":[],"responses":{},"nowMs":"1793200000000","journal":[]}"#;
        assert_eq!(save_at(&root,source).unwrap()["state"],"SAVED_READBACK_VERIFIED");
        let loaded=load_at(&root).unwrap();
        assert_eq!(loaded["state"],"LOADED_READBACK_VERIFIED");
        assert_eq!(loaded["source"],source);
        assert_eq!(clear_at(&root).unwrap()["state"],"CLEARED_READBACK_VERIFIED");
        assert_eq!(load_at(&root).unwrap()["state"],"NOT_SAVED");
        let _=fs::remove_dir_all(root);
    }
    #[test] fn invalid_or_oversized_state_refused(){
        let root=temp_root("invalid");
        assert!(save_at(&root,"not json").is_err());
        let large=format!("{{\"x\":\"{}\"}}","x".repeat(MAX_SOURCE_BYTES));
        assert!(save_at(&root,&large).is_err());
        assert!(!root.exists());
    }
}
