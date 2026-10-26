mod chooser;
mod protocol;
mod transport;
use protocol::InstallerRequest;
use serde_json::{json, Value};
use std::{path::PathBuf, sync::{Arc, Mutex}};
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

fn bundled_origin(u: &url::Url) -> bool {
    u.username().is_empty() && u.password().is_none() && u.port().is_none()
        && ((u.scheme()=="tauri" && u.host_str()==Some("localhost"))
            || (u.scheme()=="http" && u.host_str()==Some("tauri.localhost")))
}
fn local_caller(window: &WebviewWindow) -> Result<(), String> {
    let u=window.url().map_err(|_|"WINDOW_URL_UNREADABLE")?;
    if window.label()=="hex" && bundled_origin(&u) {Ok(())}
    else {Err("LOCAL_BUNDLED_WINDOW_REQUIRED".into())}
}
fn adapter_path(app: &tauri::AppHandle) -> Result<PathBuf,String> {
    let root=app.path().resource_dir().map_err(|_|"RESOURCE_ROOT_UNAVAILABLE")?.canonicalize().map_err(|_|"RESOURCE_ROOT_UNAVAILABLE")?;
    let path=root.join("adapter/installer_adapter.py");
    let canonical=path.canonicalize().map_err(|_|"BUNDLED_ADAPTER_MISSING")?;
    if canonical!=path || !canonical.starts_with(&root) || !canonical.is_file() {return Err("BUNDLED_ADAPTER_UNTRUSTED".into())}
    #[cfg(unix)] {use std::os::unix::fs::PermissionsExt; if canonical.metadata().map_err(|_|"ADAPTER_METADATA_UNREADABLE")?.permissions().mode() & 0o022 != 0 {return Err("BUNDLED_ADAPTER_WRITABLE_BY_OTHERS".into())}}
    Ok(canonical)
}
#[tauri::command]
async fn installer_request(app:tauri::AppHandle, window:WebviewWindow, request:InstallerRequest, gate:tauri::State<'_,transport::Gate>) -> Result<Value,String> {
    local_caller(&window)?;request.validate().map_err(str::to_owned)?;
    let adapter=adapter_path(&app)?;
    let home=app.path().home_dir().map_err(|_|"HOME_UNAVAILABLE")?;
    let gate=gate.inner().clone();
    tauri::async_runtime::spawn_blocking(move ||transport::execute(request,adapter,home,gate)).await.map_err(|_|"NATIVE_TRACKER_JOIN_FAILED_DO_NOT_RETRY".into())
}
fn window_trace(window:&WebviewWindow, action:&str, direction:Option<&str>, stage:&str, result:&str) {
    let ms=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|v|v.as_millis()).unwrap_or(0);
    let position=window.outer_position().ok().map(|p|json!({"x":p.x,"y":p.y}));
    let size=window.outer_size().ok().map(|p|json!({"width":p.width,"height":p.height}));
    eprintln!("HEX_NATIVE_WINDOW {}",json!({"time_ms":ms,"action":action,"direction":direction,"stage":stage,"command_result":result,"maximized":window.is_maximized().ok(),"fullscreen":window.is_fullscreen().ok(),"position":position,"size":size,"geometry_is_observation_not_drag_success":true}));
}
#[tauri::command]
fn native_product_window(window:WebviewWindow, action:String, direction:Option<String>) -> Result<Value,String> {
    local_caller(&window)?;
    if action!="resize" && direction.is_some(){return Err("DIRECTION_ONLY_FOR_RESIZE".into())}
    if !["state","drag","minimize","maximize","close","resize"].contains(&action.as_str()){return Err("UNSUPPORTED_WINDOW_ACTION".into())}
    window_trace(&window,&action,direction.as_deref(),"before","not_attempted");
    let result=match action.as_str(){
        "state"=>Ok(()),"drag"=>window.start_dragging(),"minimize"=>window.minimize(),
        "maximize"=>if window.is_maximized().map_err(|_|"WINDOW_STATE_UNREADABLE")? {window.unmaximize()} else {window.maximize()},
        "close"=>{let closed=window.close(); eprintln!("HEX_NATIVE_WINDOW {}",json!({"action":"close","stage":"dispatch","command_result":if closed.is_ok(){"accepted"}else{"failed"}}));closed.map_err(|_|"WINDOW_CLOSE_FAILED")?;return Ok(json!({"closed":true}))},
        "resize"=>{use tauri_runtime::ResizeDirection::*;let d=match direction.as_deref(){Some("n")=>North,Some("ne")=>NorthEast,Some("e")=>East,Some("se")=>SouthEast,Some("s")=>South,Some("sw")=>SouthWest,Some("w")=>West,Some("nw")=>NorthWest,_=>return Err("INVALID_RESIZE_DIRECTION".into())};window.get_window(window.label()).ok_or("NATIVE_WINDOW_UNAVAILABLE")?.start_resize_dragging(d)},
        _=>return Err("UNSUPPORTED_WINDOW_ACTION".into())};
    window_trace(&window,&action,direction.as_deref(),"after_dispatch",if result.is_ok(){"accepted"}else{"failed"});
    result.map_err(|_|"WINDOW_ACTION_FAILED")?;
    Ok(json!({"maximized":window.is_maximized().map_err(|_|"WINDOW_STATE_UNREADABLE")?,"fullscreen":window.is_fullscreen().map_err(|_|"WINDOW_STATE_UNREADABLE")?}))
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(){
    tauri::Builder::default().manage(Arc::new(Mutex::new(())) as transport::Gate)
        .invoke_handler(tauri::generate_handler![installer_request,native_product_window,chooser::native_select_directory])
        .setup(|app|{
            WebviewWindowBuilder::new(app,"hex",WebviewUrl::App("index.html".into()))
                .title("XI-IO HEX").inner_size(1440.,900.).min_inner_size(720.,480.)
                .decorations(false).resizable(true)
                .on_navigation(bundled_origin)
                .build()?;Ok(())
        }).run(tauri::generate_context!()).expect("XI-IO HEX native carrier failed");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn exact_local_origins_only() {
        for value in ["tauri://localhost/index.html", "http://tauri.localhost/index.html"] {
            assert!(bundled_origin(&url::Url::parse(value).unwrap()));
        }
        for value in ["tauri://other/index.html", "https://xi-io.net/", "http://tauri.localhost:8080/", "http://user@tauri.localhost/"] {
            assert!(!bundled_origin(&url::Url::parse(value).unwrap()));
        }
    }
}
