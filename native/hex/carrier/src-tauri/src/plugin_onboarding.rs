//! Read-only native view of the existing HEX first-party onboarding owner.
//! Never a second identity source. This Tauri WebView has no XI-IO browser
//! cookie/session, so a 200 received without an authenticated native handoff
//! cannot be promoted to signed-in or used for profile/permission decisions.
use serde_json::{json,Value};
use std::io::{Read,Write};
use std::net::{SocketAddrV4,Ipv4Addr,TcpStream};
use std::str::from_utf8;
use std::time::Duration;

const SCHEMA:&str="xiio.onboarding.current/v1";
const REQUEST:&[u8]=b"GET /v1/onboarding/current HTTP/1.1\r\nHost: 127.0.0.1:8798\r\nAccept: application/json\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
const MAX_RESPONSE:usize=16_384;

fn unavailable(code:&str)->Value{
    json!({"schema":SCHEMA,"plane":"XIIO_FIRST_PARTY","state":"AUTHORITY_UNAVAILABLE",
        "next":"RESTORE_FIRST_PARTY_SESSION_OWNER","first_red":code,
        "authenticated":false,"connection_choice":"NOT_ASKED",
        "consent":"NOT_REQUESTED","services":"NOT_DISCOVERED",
        "provisioning":"NOT_AUTHORIZED","authority_granted":false,
        "ward_admission":false,"provider_effect":false})
}

fn safe_code(code:&str)->bool {
    (4..=100).contains(&code.len()) &&
        code.bytes().all(|x|x==b'_'||x.is_ascii_uppercase()||x.is_ascii_digit())
}

fn parse_status(raw:&[u8])->Value {
    if raw.len()>MAX_RESPONSE{return unavailable("NATIVE_ONBOARDING_BODY_OVERSIZE")}
    let Some(sep)=raw.windows(4).position(|x|x==b"\r\n\r\n") else {
        return unavailable("NATIVE_ONBOARDING_HTTP_INVALID")
    };
    let Ok(header)=from_utf8(&raw[..sep]) else {return unavailable("NATIVE_ONBOARDING_HTTP_INVALID")};
    if sep>4096{return unavailable("NATIVE_ONBOARDING_HTTP_INVALID")}
    let mut lines=header.split("\r\n");
    let Some(status)=lines.next() else {return unavailable("NATIVE_ONBOARDING_HTTP_INVALID")};
    let code=match status.split_whitespace().collect::<Vec<_>>().as_slice() {
        ["HTTP/1.1",code,..] => code.parse::<u16>().ok(),
        _ => None,
    };
    let mut length=None;
    let mut json_type=false;
    let mut no_store=false;
    for line in lines {
        let Some((name,val))=line.split_once(':') else {return unavailable("NATIVE_ONBOARDING_HTTP_INVALID")};
        let name=name.trim().to_ascii_lowercase();
        let value=val.trim();
        match name.as_str() {
            "content-length"=>{
                if length.is_some(){return unavailable("NATIVE_ONBOARDING_HTTP_INVALID")}
                length=value.parse::<usize>().ok();
            }
            "content-type"=>json_type=value.to_ascii_lowercase().starts_with("application/json"),
            "cache-control"=>no_store=value.split(',').any(|x|x.trim().eq_ignore_ascii_case("no-store")),
            "transfer-encoding"=>return unavailable("NATIVE_ONBOARDING_HTTP_INVALID"),
            _=>{}
        }
    }
    let body=&raw[sep+4..];
    if length!=Some(body.len()) || body.len()>8192 || !json_type || !no_store {
        return unavailable("NATIVE_ONBOARDING_HTTP_INVALID")
    }
    let Ok(value)=serde_json::from_slice::<Value>(body) else {
        return unavailable("NATIVE_ONBOARDING_JSON_INVALID")
    };
    let safe=value.get("schema")==Some(&json!(SCHEMA)) &&
        value.get("plane")==Some(&json!("XIIO_FIRST_PARTY")) &&
        value.get("authority_granted")==Some(&json!(false)) &&
        value.get("ward_admission")==Some(&json!(false)) &&
        value.get("provider_effect")==Some(&json!(false)) &&
        value.get("consent")==Some(&json!("NOT_REQUESTED")) &&
        value.get("services")==Some(&json!("NOT_DISCOVERED")) &&
        value.get("provisioning")==Some(&json!("NOT_AUTHORIZED"));
    if !safe {return unavailable("NATIVE_ONBOARDING_SCHEMA_UNVERIFIED")}
    match code {
        Some(401) if value.get("state")==Some(&json!("OWNER_SIGNIN_REQUIRED")) &&
            value.get("next")==Some(&json!("XIIO_FIRST_PARTY_SIGN_IN")) &&
            value.get("authenticated")==Some(&json!(false)) &&
            value.get("connection_choice")==Some(&json!("NOT_ASKED")) => {
            // Lack of browser cookies here is not evidence that the browser
            // session is signed out. Do not promote the owner identity.
            json!({"schema":SCHEMA,"plane":"XIIO_FIRST_PARTY",
                "state":"OWNER_SIGNIN_REQUIRED","next":"XIIO_FIRST_PARTY_SIGN_IN",
                "authenticated":false,"connection_choice":"NOT_ASKED",
                "consent":"NOT_REQUESTED","services":"NOT_DISCOVERED",
                "provisioning":"NOT_AUTHORIZED","authority_granted":false,
                "ward_admission":false,"provider_effect":false,
                "native_browser_session_shared":false})
        }
        Some(503) if value.get("state")==Some(&json!("AUTHORITY_UNAVAILABLE")) &&
            value.get("next")==Some(&json!("RESTORE_FIRST_PARTY_SESSION_OWNER")) &&
            value.get("authenticated")==Some(&json!(false)) &&
            value.get("connection_choice")==Some(&json!("NOT_ASKED")) => {
            let code=value.get("first_red").and_then(Value::as_str).unwrap_or("");
            unavailable(if safe_code(code){code}else{"NATIVE_ONBOARDING_READBACK_UNVERIFIED"})
        }
        // This client deliberately sends NO owner session. Even a local 200
        // cannot be treated as a verified login without current credential
        // custody and explicit cross-client session handoff.
        Some(200)=>unavailable("NATIVE_AUTHENTICATED_HANDOFF_UNBOUND"),
        _=>unavailable("NATIVE_ONBOARDING_READBACK_UNVERIFIED")
    }
}

/// Fixed loopback only, no provider tokens, no Authorization/Cookie headers.
pub fn read_current()->Value{
    let target=SocketAddrV4::new(Ipv4Addr::LOCALHOST,8798);
    let Ok(mut stream)=TcpStream::connect_timeout(&target.into(),Duration::from_millis(1200)) else {
        return unavailable("FIRST_PARTY_HEX_READER_UNREACHABLE")
    };
    if stream.set_read_timeout(Some(Duration::from_millis(1500))).is_err() ||
        stream.set_write_timeout(Some(Duration::from_millis(1500))).is_err() ||
        stream.write_all(REQUEST).is_err() {
        return unavailable("FIRST_PARTY_HEX_READER_UNREACHABLE")
    }
    let mut raw=Vec::new();
    let response=stream.by_ref().take((MAX_RESPONSE+1) as u64).read_to_end(&mut raw);
    if response.is_err(){return unavailable("FIRST_PARTY_HEX_READER_UNREACHABLE")}
    parse_status(&raw)
}

#[cfg(test)]
mod tests{
    use super::*;
    fn http(code:u16,body:Value)->Vec<u8>{
        let data=body.to_string();
        format!("HTTP/1.1 {code} Current\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{}",data.len(),data).into_bytes()
    }
    fn base(state:&str,next:&str)->Value{
        json!({"schema":SCHEMA,"plane":"XIIO_FIRST_PARTY","state":state,"next":next,
        "authenticated":false,"connection_choice":"NOT_ASKED",
        "consent":"NOT_REQUESTED","services":"NOT_DISCOVERED","provisioning":"NOT_AUTHORIZED",
        "authority_granted":false,"ward_admission":false,"provider_effect":false})
    }
    #[test]fn signed_out_local_context_is_not_promoted(){
        let data=http(401,base("OWNER_SIGNIN_REQUIRED","XIIO_FIRST_PARTY_SIGN_IN"));
        let output=parse_status(&data);
        assert_eq!(output["state"],"OWNER_SIGNIN_REQUIRED");
        assert_eq!(output["native_browser_session_shared"],false);
        assert_eq!(output["authenticated"],false);
    }
    #[test]fn unbound_first_party_store_remains_unavailable(){
        let mut source=base("AUTHORITY_UNAVAILABLE","RESTORE_FIRST_PARTY_SESSION_OWNER");
        source["first_red"]=json!("FIRST_PARTY_ONBOARDING_OWNER_UNBOUND");
        let out=parse_status(&http(503,source));
        assert_eq!(out["first_red"],"FIRST_PARTY_ONBOARDING_OWNER_UNBOUND");
    }
    #[test]fn even_200_with_fake_identity_never_becomes_native_auth(){
        let mut source=base("CONNECTION_CHOICE_REQUIRED","ASK_OWNER_WHAT_TO_CONNECT");
        source["authenticated"]=json!(true);
        source["account_ref"]=json!("account:fake");
        let result=parse_status(&http(200,source));
        assert_eq!(result["state"],"AUTHORITY_UNAVAILABLE");
        assert!(result.get("account_ref").is_none());
    }
    #[test]fn wrong_provider_or_grant_refused(){
        let mut source=base("OWNER_SIGNIN_REQUIRED","XIIO_FIRST_PARTY_SIGN_IN");
        source["ward_admission"]=json!(true);
        assert_eq!(parse_status(&http(401,source))["state"],"AUTHORITY_UNAVAILABLE");
    }
    #[test]fn malformed_and_unbounded_http_refused(){
        assert_eq!(parse_status(b"HTTP/1.1 200 OK\r\n\r\n{}")["state"],"AUTHORITY_UNAVAILABLE");
        assert_eq!(parse_status(&vec![b'x';MAX_RESPONSE+1])["first_red"],"NATIVE_ONBOARDING_BODY_OVERSIZE");
    }
    #[test]fn no_origin_cookie_or_bearer_is_forwarded(){
        let text=from_utf8(REQUEST).unwrap().to_ascii_lowercase();
        assert!(!text.contains("authorization:"));
        assert!(!text.contains("cookie:"));
        assert!(!text.contains("x-forwarded"));
        assert_eq!(text.matches("get /v1/onboarding/current").count(),1);
    }
}
