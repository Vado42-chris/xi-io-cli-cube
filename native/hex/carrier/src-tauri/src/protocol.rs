use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Component, Path};

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "action", rename_all = "lowercase", deny_unknown_fields)]
pub enum InstallerRequest {
    #[serde(rename = "local_ai_status")]
    LocalAiStatus { plan_id: String },
    #[serde(rename = "safe_task_inspect")]
    SafeTaskInspect { plan_id: String },
    #[serde(rename = "safe_task_prepare")]
    SafeTaskPrepare { plan_id: String, workspace: String },
    #[serde(rename = "safe_task_apply")]
    SafeTaskApply { plan_id: String, proof_id: String, approval_digest: String, approved: bool },
    Inspect { #[serde(default, skip_serializing_if = "Option::is_none")] plan_id: Option<String> },
    #[serde(rename = "prepare_repair")]
    PrepareRepair { prefix: String, node: String, bin_dir: String },
    #[serde(rename = "apply_repair")]
    ApplyRepair { plan_id: String, approval_digest: String, approved: bool },
    Prepare { prefix: String, node: String, components: Vec<String>, permission_profile: Value },
    Readback { plan_id: String },
    Apply { plan_id: String, approval_digest: String, approved: bool },
    Rollback { plan_id: String, approval_digest: String, approved: bool },
    #[serde(rename = "permission_replace")]
    PermissionReplace { plan_id: String, current_digest: String, new_profile: Value, approved: bool },
    #[serde(rename = "central_update_decision")]
    CentralUpdateDecision { plan_id: String, request: Value },
    #[serde(rename = "service_plan")]
    ServicePlan { plan_id: String, service_ids: Vec<String> },
    #[serde(rename = "service_start")]
    ServiceStart { plan_id: String, service_ids: Vec<String>, service_plan_digest: String, approved: bool },
    #[serde(rename = "service_stop")]
    ServiceStop { plan_id: String, service_ids: Vec<String>, service_plan_digest: String, approved: bool },
    #[serde(rename = "server_prepare")]
    ServerPrepare { plan_id: String, package_root: String },
    #[serde(rename = "server_apply")]
    ServerApply { plan_id: String, package_root: String, server_plan: Value, server_plan_digest: String, approved: bool },
    #[serde(rename = "server_rollback")]
    ServerRollback { plan_id: String, server_plan: Value, server_plan_digest: String, approved: bool },
    #[serde(rename = "hotpatch_prepare")]
    HotpatchPrepare { plan_id: String, request: Value, package_root: String },
    #[serde(rename = "hotpatch_apply")]
    HotpatchApply { plan_id: String, request: Value, package_root: String, server_plan: Value, server_plan_digest: String, authorization: Value, approved: bool },
}
fn id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 128 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}
fn lower_hex(s:&str,n:usize)->bool { s.len()==n && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }
fn bounded_object(v:&Value,max_bytes:usize)->bool {
    v.is_object() && serde_json::to_vec(v).map(|b| b.len()<=max_bytes).unwrap_or(false)
}
fn service_ids(values:&[String])->bool {
    !values.is_empty() && values.len()<=32
        && values.iter().all(|v| id(v))
        && values.iter().enumerate().all(|(i,v)| !values[..i].contains(v))
}
fn absolute(s: &str) -> bool {
    !s.contains('\0') && s.len() <= 4096 && Path::new(s).is_absolute()
        && !Path::new(s).components().any(|c| matches!(c, Component::ParentDir | Component::CurDir))
        && Path::new(s).parent().is_some()
}
impl InstallerRequest {
    pub fn validate(&self) -> Result<(), &'static str> {
        let valid = match self {
            Self::LocalAiStatus { plan_id } | Self::SafeTaskInspect { plan_id } => id(plan_id),
            Self::SafeTaskPrepare { plan_id, workspace } => id(plan_id) && absolute(workspace),
            Self::SafeTaskApply { plan_id, proof_id, approval_digest, approved } =>
                *approved && id(plan_id) && lower_hex(proof_id,32) && lower_hex(approval_digest,64),
            Self::Inspect { plan_id } => plan_id.as_deref().map(id).unwrap_or(true),
            Self::Readback { plan_id } => id(plan_id),
            Self::PrepareRepair { prefix, node, bin_dir } => absolute(prefix) && absolute(node) && absolute(bin_dir),
            Self::Prepare { prefix, node, components, permission_profile } => absolute(prefix) && absolute(node)
                && (1..=3).contains(&components.len()) && components.iter().any(|x| x == "cli")
                && components.iter().all(|x| ["cli", "bins", "switchboard"].contains(&x.as_str()))
                && components.iter().enumerate().all(|(i, x)| !components[..i].contains(x))
                && bounded_object(permission_profile, 16 * 1024),
            Self::ApplyRepair { plan_id, approval_digest, approved }
            | Self::Apply { plan_id, approval_digest, approved }
            | Self::Rollback { plan_id, approval_digest, approved } => *approved && id(plan_id)
                && lower_hex(approval_digest,64),
            Self::PermissionReplace { plan_id, current_digest, new_profile, approved } =>
                *approved && id(plan_id) && lower_hex(current_digest,64) && bounded_object(new_profile,16*1024),
            Self::CentralUpdateDecision { plan_id, request } =>
                id(plan_id) && bounded_object(request,16*1024),
            Self::ServicePlan { plan_id, service_ids: ids } =>
                id(plan_id) && service_ids(ids),
            Self::ServiceStart { plan_id, service_ids: ids, service_plan_digest, approved }
            | Self::ServiceStop { plan_id, service_ids: ids, service_plan_digest, approved } =>
                *approved && id(plan_id) && service_ids(ids) && lower_hex(service_plan_digest,64),
            Self::ServerPrepare { plan_id, package_root } =>
                id(plan_id) && absolute(package_root),
            Self::ServerApply { plan_id, package_root, server_plan, server_plan_digest, approved } =>
                *approved && id(plan_id) && absolute(package_root)
                && bounded_object(server_plan,128*1024) && lower_hex(server_plan_digest,64),
            Self::ServerRollback { plan_id, server_plan, server_plan_digest, approved } =>
                *approved && id(plan_id) && bounded_object(server_plan,128*1024) && lower_hex(server_plan_digest,64),
            Self::HotpatchPrepare { plan_id, request, package_root } =>
                id(plan_id) && absolute(package_root) && bounded_object(request,16*1024),
            Self::HotpatchApply { plan_id, request, package_root, server_plan, server_plan_digest, authorization, approved } =>
                *approved && id(plan_id) && absolute(package_root)
                && bounded_object(request,16*1024) && bounded_object(server_plan,128*1024)
                && bounded_object(authorization,16*1024) && lower_hex(server_plan_digest,64),
        };
        if valid { Ok(()) } else { Err("INVALID_INSTALLER_REQUEST") }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn valid(s: &str) -> bool { serde_json::from_str::<InstallerRequest>(s).map(|r| r.validate().is_ok()).unwrap_or(false) }
    #[test] fn finite_protocol() {
        assert!(valid(r#"{"action":"inspect"}"#));
        assert!(valid(r#"{"action":"prepare","prefix":"/home/a/xiio","node":"/usr/bin/node","components":["cli"],"permission_profile":{"schema":"xiio.hex.permission-profile/v1","profile_id":"local-standard","capabilities":["install_files"],"service_scopes":[],"update_policy":"notify","central_updates":false,"remote_access":false,"revoked":false}}"#));
        assert!(!valid(r#"{"action":"inspect","command":"bash"}"#));
        assert!(!valid(r#"{"action":"exec","command":"bash"}"#));
        assert!(!valid(r#"{"action":"readback","plan_id":"../x"}"#));
        assert!(!valid(r#"{"action":"prepare","prefix":"/","node":"/usr/bin/node","components":["cli"]}"#));
        assert!(!valid(r#"{"action":"prepare","prefix":"/tmp/../x","node":"/usr/bin/node","components":["cli"]}"#));
        assert!(!valid(r#"{"action":"prepare","prefix":"/tmp/x","node":"node","components":["cli"]}"#));
        assert!(!valid(r#"{"action":"prepare","prefix":"/tmp/x","node":"/usr/bin/node","components":["cli","cli"]}"#));
    }
    #[test] fn bounded_original_local_steps() {
        assert!(valid(r#"{"action":"local_ai_status","plan_id":"plan-1"}"#));
        assert!(valid(r#"{"action":"safe_task_inspect","plan_id":"plan-1"}"#));
        assert!(!valid(r#"{"action":"safe_task_inspect","plan_id":"plan-1","workspace":"/tmp"}"#));
        assert!(!valid(r#"{"action":"local_ai_status","plan_id":"plan-1","url":"http://other"}"#));
        assert!(valid(r#"{"action":"safe_task_prepare","plan_id":"plan-1","workspace":"/home/a/work"}"#));
        for workspace in ["/", "relative", "/tmp/../other"] {
            assert!(!valid(&serde_json::json!({"action":"safe_task_prepare","plan_id":"plan-1","workspace":workspace}).to_string()));
        }
        let mut value=serde_json::json!({"action":"safe_task_apply","plan_id":"plan-1","proof_id":"b".repeat(32),"approval_digest":"a".repeat(64),"approved":true});
        assert!(valid(&value.to_string()));
        value["approved"]=false.into();assert!(!valid(&value.to_string()));value["approved"]=true.into();
        value["proof_id"]="../bad".into();assert!(!valid(&value.to_string()));value["proof_id"]="b".repeat(32).into();
        value["command"]="bash".into();assert!(!valid(&value.to_string()));
    }
    #[test] fn bounded_launcher_repair() {
        let mut p=serde_json::json!({"action":"prepare_repair","prefix":"/home/a/cli-v1","node":"/home/a/node","bin_dir":"/home/a/.local/bin"});
        assert!(valid(&p.to_string()));
        p["node"]="node".into(); assert!(!valid(&p.to_string())); p["node"]="/home/a/node".into();
        p["bin_dir"]="/tmp/../bin".into(); assert!(!valid(&p.to_string())); p["bin_dir"]="/home/a/.local/bin".into();
        p["command"]="sh".into(); assert!(!valid(&p.to_string()));
        let mut a=serde_json::json!({"action":"apply_repair","plan_id":"a".repeat(32),"approval_digest":"b".repeat(64),"approved":true});
        assert!(valid(&a.to_string())); a["approved"]=false.into(); assert!(!valid(&a.to_string()));
        a["approved"]=true.into(); a["approval_digest"]="stale".into(); assert!(!valid(&a.to_string()));
    }
    #[test] fn approval_is_explicit_and_bound() {
        let mut value=serde_json::json!({"action":"apply","plan_id":"plan-1","approval_digest":"a".repeat(64),"approved":true});
        assert!(valid(&value.to_string())); value["approved"]=false.into(); assert!(!valid(&value.to_string()));
        value["approved"]=true.into(); value["approval_digest"]="ABC".into(); assert!(!valid(&value.to_string()));
    }
}
