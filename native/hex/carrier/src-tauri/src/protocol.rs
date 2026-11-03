use serde::{Deserialize, Serialize};
use std::path::{Component, Path};

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "action", rename_all = "lowercase", deny_unknown_fields)]
pub enum InstallerRequest {
    #[serde(rename = "bundle_inspect")]
    BundleInspect {},
    #[serde(rename = "bundle_apply")]
    BundleApply { lock_sha256: String, approved: bool },
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
    Prepare { prefix: String, node: String, components: Vec<String> },
    Readback { plan_id: String },
    Apply { plan_id: String, approval_digest: String, approved: bool },
    Rollback { plan_id: String, approval_digest: String, approved: bool },
}
fn id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 128 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}
fn lower_hex(s:&str,n:usize)->bool { s.len()==n && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }
fn absolute(s: &str) -> bool {
    !s.contains('\0') && s.len() <= 4096 && Path::new(s).is_absolute()
        && !Path::new(s).components().any(|c| matches!(c, Component::ParentDir | Component::CurDir))
        && Path::new(s).parent().is_some()
}
impl InstallerRequest {
    pub fn validate(&self) -> Result<(), &'static str> {
        let valid = match self {
            Self::BundleInspect {} => true,
            Self::BundleApply { lock_sha256, approved } => *approved && lower_hex(lock_sha256, 64),
            Self::LocalAiStatus { plan_id } | Self::SafeTaskInspect { plan_id } => id(plan_id),
            Self::SafeTaskPrepare { plan_id, workspace } => id(plan_id) && absolute(workspace),
            Self::SafeTaskApply { plan_id, proof_id, approval_digest, approved } =>
                *approved && id(plan_id) && lower_hex(proof_id,32) && lower_hex(approval_digest,64),
            Self::Inspect { plan_id } => plan_id.as_deref().map(id).unwrap_or(true),
            Self::Readback { plan_id } => id(plan_id),
            Self::PrepareRepair { prefix, node, bin_dir } => absolute(prefix) && absolute(node) && absolute(bin_dir),
            Self::Prepare { prefix, node, components } => absolute(prefix) && absolute(node)
                && (1..=3).contains(&components.len()) && components.iter().any(|x| x == "cli")
                && components.iter().all(|x| ["cli", "bins", "switchboard"].contains(&x.as_str()))
                && components.iter().enumerate().all(|(i, x)| !components[..i].contains(x)),
            Self::ApplyRepair { plan_id, approval_digest, approved }
            | Self::Apply { plan_id, approval_digest, approved }
            | Self::Rollback { plan_id, approval_digest, approved } => *approved && id(plan_id)
                && approval_digest.len() == 64
                && approval_digest.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
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
        assert!(valid(r#"{"action":"prepare","prefix":"/home/a/xiio","node":"/usr/bin/node","components":["cli"]}"#));
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
    #[test] fn core_bundle_request_is_explicitly_approved_and_bounded() {
        assert!(valid(r#"{"action":"bundle_inspect"}"#));
        assert!(!valid(r#"{"action":"bundle_inspect","url":"http://localhost:8798"}"#));
        let mut v=serde_json::json!({"action":"bundle_apply","lock_sha256":"a".repeat(64),"approved":true});
        assert!(valid(&v.to_string()));
        v["approved"]=false.into();assert!(!valid(&v.to_string()));v["approved"]=true.into();
        v["lock_sha256"]="sha256:abc".into();assert!(!valid(&v.to_string()));v["lock_sha256"]="a".repeat(64).into();
        v["url"]="http://localhost".into();assert!(!valid(&v.to_string()));
    }
    #[test] fn approval_is_explicit_and_bound() {
        let mut value=serde_json::json!({"action":"apply","plan_id":"plan-1","approval_digest":"a".repeat(64),"approved":true});
        assert!(valid(&value.to_string())); value["approved"]=false.into(); assert!(!valid(&value.to_string()));
        value["approved"]=true.into(); value["approval_digest"]="ABC".into(); assert!(!valid(&value.to_string()));
    }
}
