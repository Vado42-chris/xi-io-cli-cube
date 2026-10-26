//! Native OS folder choice only. Selection does not create, install or grant access.
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, WebviewWindow};
static CHOOSER_OPEN: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Deserialize)]
#[serde(rename_all="lowercase")]
pub enum DirectoryPurpose { Workspace, Installation }
impl DirectoryPurpose {
    fn title(&self)-> &'static str { match self {
        Self::Workspace=>"Choose workspace folder", Self::Installation=>"Choose CLI installation folder",
    }}
}
fn selected_path(path:Option<std::path::PathBuf>)->Result<Value,String>{
    let p=path.ok_or("DIRECTORY_SELECTION_UNAVAILABLE")?;
    let s=p.to_str().ok_or("DIRECTORY_PATH_NOT_UTF8")?;
    if !p.is_absolute() || !p.is_dir() || s.len()>4096 || s.contains('\0') {
        return Err("DIRECTORY_SELECTION_INVALID".into())
    }
    // Do not change/canonicalize the owner's choice or persist it as a grant.
    Ok(json!({"cancelled":false,"path":s}))
}

#[tauri::command]
pub async fn native_select_directory(app:tauri::AppHandle, window:WebviewWindow, purpose:DirectoryPurpose)->Result<Value,String>{
    crate::local_caller(&window)?;
    #[cfg(not(target_os="linux"))]
    { let _=(app,purpose);return Err("DIRECTORY_PICKER_PLATFORM_UNQUALIFIED".into()); }
    #[cfg(target_os="linux")]
    {
        if CHOOSER_OPEN.compare_exchange(false,true,Ordering::SeqCst,Ordering::SeqCst).is_err(){return Err("DIRECTORY_PICKER_ALREADY_OPEN".into())}
        let home=app.path().home_dir().ok().filter(|p|p.is_absolute()&&p.is_dir());
        let (tx,rx)=std::sync::mpsc::channel();
        let scheduled=app.run_on_main_thread(move ||{
            use gtk::prelude::*;
            use std::{cell::RefCell,rc::Rc};
            let parent=match window.gtk_window(){Ok(w)=>w,Err(_)=>{
                CHOOSER_OPEN.store(false,Ordering::SeqCst);
                let _=tx.send(Err("NATIVE_PARENT_UNAVAILABLE".into()));return
            }};
            let dialog=gtk::FileChooserNative::new(Some(purpose.title()),Some(&parent),gtk::FileChooserAction::SelectFolder,Some("Select folder"),Some("Cancel"));
            dialog.set_modal(true);
            dialog.set_select_multiple(false);
            dialog.set_local_only(true);
            dialog.set_create_folders(false);
            if let Some(home)=home {let _=dialog.set_current_folder(home);}
            // Keep the GObject alive only until its one response; disconnect the
            // handler and release the retained reference to avoid a signal cycle.
            let hold=Rc::new(RefCell::new(None::<(gtk::FileChooserNative,gtk::glib::SignalHandlerId)>));
            let response_hold=hold.clone();
            let id=dialog.connect_response(move |dialog,response|{
                let result=if response==gtk::ResponseType::Accept {selected_path(dialog.filename())}
                    else {Ok(json!({"cancelled":true}))};
                if let Some((held,id))=response_hold.borrow_mut().take(){held.disconnect(id);held.destroy();}
                CHOOSER_OPEN.store(false,Ordering::SeqCst);
                let _=tx.send(result);
            });
            *hold.borrow_mut()=Some((dialog.clone(),id));
            dialog.show();
        });
        if scheduled.is_err(){CHOOSER_OPEN.store(false,Ordering::SeqCst);return Err("NATIVE_DIALOG_NOT_SCHEDULED".into())}
        tauri::async_runtime::spawn_blocking(move ||rx.recv().unwrap_or_else(|_|Err("NATIVE_DIALOG_RESPONSE_LOST".into())))
            .await.map_err(|_|"NATIVE_DIALOG_TASK_FAILED".to_string())?
    }
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test] fn finite_purposes_only(){
        assert!(serde_json::from_str::<DirectoryPurpose>("\"workspace\"").is_ok());
        assert!(serde_json::from_str::<DirectoryPurpose>("\"installation\"").is_ok());
        assert!(serde_json::from_str::<DirectoryPurpose>("\"arbitrary-file\"").is_err());
    }
    #[test] fn no_relative_or_missing_selection(){
        assert!(selected_path(None).is_err());
        assert!(selected_path(Some("relative".into())).is_err());
    }
}
