from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from . import __version__
from .discovery import discover_host
from .manifest import load_manifest, verify_payload
from .diagnostics import diagnostic_bundle, evidence_status
from .observability import OperationJournal, inspect_operation, list_operations
from .redaction import redact_text
from .transaction import apply_install, plan_install, rollback
from .consent import SCOPES, authorize, compile_policy, read_receipt, replace_receipt, write_receipt
from .service_profile import compile_service_activation, load_service_profile
from .update_request import authorize_update, load_update_request
from .runtime_profile import load_runtime_profile, qualify_update_request
from .runtime_activation import activate_runtime_profile, revoke_runtime_consent


def _refs_from_items(items: list[Any]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    for item in items:
        data = item if isinstance(item, dict) else getattr(item, "__dict__", {})
        if not isinstance(data, dict):
            continue
        scope = data.get("destination_scope")
        destination = data.get("destination")
        if isinstance(scope, str) and isinstance(destination, str):
            ref = {"destination_scope": scope, "destination": destination}
            action = data.get("action")
            if isinstance(action, str):
                ref["action"] = action
            refs.append(ref)
    return refs


def _receipt_refs(receipt_path: Path) -> list[dict[str, Any]]:
    try:
        data = json.loads(receipt_path.read_text(encoding="utf-8"))
    except Exception:
        return []
    entries = data.get("entries") if isinstance(data, dict) else None
    return _refs_from_items(entries if isinstance(entries, list) else [])


def _expected_action(cmd: str) -> str:
    return {
        "discover": "discover local host capabilities without mutation",
        "verify-payload": "verify immutable product payload custody",
        "plan": "compile an installation plan without mutation",
        "apply": "apply an explicitly approved installation transaction",
        "rollback": "rollback an explicitly approved installation transaction",
        "consent-write": "store explicit local install/update permissions",
        "consent-update": "replace local install/update permissions with compare-and-swap",
        "consent-status": "read the local install/update permission receipt",
        "consent-check": "evaluate one requested operation against local permission",
        "service-activation": "compile a consent-bound local service activation packet",
        "update-authorize": "authorize a central update request against local consent",
        "activate-runtime": "activate explicitly opted-in runtime services and persist consent/readback",
        "revoke-runtime-consent": "revoke future managed-update consent without silently stopping services",
        "qualify-update": "qualify a central update request against local runtime consent without executing it",
        "diagnostic-bundle": "export a redacted diagnostic bundle to an explicitly approved external path",
    }.get(cmd, cmd)


def _meta_command(args: argparse.Namespace) -> int | None:
    if args.cmd == "operations":
        print(json.dumps(list_operations(), indent=2))
        return 0
    if args.cmd == "inspect-operation":
        print(json.dumps(inspect_operation(args.target_operation_id), indent=2))
        return 0
    if args.cmd == "diagnostic-bundle" and args.output is None:
        result = diagnostic_bundle(args.source_operation_id)
        print(json.dumps(result, indent=2))
        return 0
    if args.cmd == "evidence-status":
        print(json.dumps(evidence_status(), indent=2))
        return 0
    return None


def _print_meta_failure(exc: Exception) -> int:
    print(
        json.dumps(
            {
                "error": redact_text(str(exc)) or exc.__class__.__name__,
                "failure_category": exc.__class__.__name__,
                "operation_id": None,
                "observability_meta_command": True,
            },
            indent=2,
        ),
        file=sys.stderr,
    )
    return 1


def _finish_terminal_or_report_unknown(
    journal: OperationJournal,
    outcome: str,
    observed_result: str,
    *,
    expected_action: str,
    execution_result: str,
    do_not_retry_before_reconcile: bool = False,
    **kwargs: Any,
) -> bool:
    try:
        journal.finish(
            outcome,
            observed_result,
            expected_action=expected_action,
            **kwargs,
        )
        return True
    except Exception as exc:
        payload = {
            "error": "operation result was observed but terminal evidence could not be finalized; evidence state is unknown",
            "failure_category": "observability_finalization_failed",
            "observed_result": redact_text(str(exc)) or exc.__class__.__name__,
            "operation_id": journal.operation_id,
            "correlation_id": journal.correlation_id,
            "execution_result": execution_result,
            "evidence_state": "unknown",
            "do_not_retry_before_reconcile": do_not_retry_before_reconcile,
            "recommended_next_action": (
                "reconcile the receipt and current installed state before any retry"
                if do_not_retry_before_reconcile
                else f"inspect-operation {journal.operation_id}; retry only if the underlying operation itself must be repeated"
            ),
        }
        print(json.dumps(payload, indent=2), file=sys.stderr)
        return False


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="xi-io-installer")
    p.add_argument("--operation-id", help="optional caller-supplied operation identifier")
    p.add_argument("--correlation-id", help="optional caller-supplied correlation identifier")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("discover")
    vp = sub.add_parser("verify-payload")
    vp.add_argument("manifest", type=Path)
    vp.add_argument("payload_root", type=Path)
    pp = sub.add_parser("plan")
    pp.add_argument("manifest", type=Path)
    pp.add_argument("payload_root", type=Path)
    ap = sub.add_parser("apply")
    ap.add_argument("manifest", type=Path)
    ap.add_argument("payload_root", type=Path)
    ap.add_argument("receipt", type=Path)
    ap.add_argument("--approve", action="store_true", help="required for mutation")
    rp = sub.add_parser("rollback")
    rp.add_argument("receipt", type=Path)
    rp.add_argument("--approve", action="store_true", help="required for mutation")
    cp = sub.add_parser("consent-write")
    cp.add_argument("policy", type=Path)
    cp.add_argument("receipt", type=Path)
    cp.add_argument("--approve", action="store_true", help="required to persist permission choices")
    cu = sub.add_parser("consent-update")
    cu.add_argument("policy", type=Path)
    cu.add_argument("receipt", type=Path)
    cu.add_argument("expected_consent_sha256")
    cu.add_argument("--approve", action="store_true", help="required to replace permission choices")
    cs = sub.add_parser("consent-status")
    cs.add_argument("receipt", type=Path)
    cc = sub.add_parser("consent-check")
    cc.add_argument("receipt", type=Path)
    cc.add_argument("scope", choices=SCOPES)
    cc.add_argument("principal_ref")
    cc.add_argument("device_ref")
    cc.add_argument("--product-id")
    cc.add_argument("--service-id")
    sa = sub.add_parser("service-activation")
    sa.add_argument("profile", type=Path)
    sa.add_argument("consent_receipt", type=Path)
    sa.add_argument("principal_ref")
    sa.add_argument("device_ref")
    ua = sub.add_parser("update-authorize")
    ua.add_argument("request", type=Path)
    ua.add_argument("consent_receipt", type=Path)
    ua.add_argument("principal_ref")
    ua.add_argument("device_ref")
    ar = sub.add_parser("activate-runtime")
    ar.add_argument("runtime_profile", type=Path)
    ar.add_argument("consent_receipt", type=Path)
    ar.add_argument("activation_receipt", type=Path)
    ar.add_argument("--grant", action="append", default=[])
    ar.add_argument("--update-policy", choices=["MANUAL","SECURITY_AUTO","MANAGED"])
    ar.add_argument("--principal-ref", default="local-user")
    ar.add_argument("--approve", action="store_true", help="required for runtime activation")
    rr = sub.add_parser("revoke-runtime-consent")
    rr.add_argument("consent_receipt", type=Path)
    rr.add_argument("--approve", action="store_true", help="required for consent revocation")
    qu = sub.add_parser("qualify-update")
    qu.add_argument("runtime_profile", type=Path)
    qu.add_argument("consent_receipt", type=Path)
    qu.add_argument("update_request", type=Path)
    sub.add_parser("operations")
    sub.add_parser("evidence-status")
    ip = sub.add_parser("inspect-operation")
    ip.add_argument("target_operation_id")
    db = sub.add_parser("diagnostic-bundle")
    db.add_argument("source_operation_id")
    db.add_argument("--output", type=Path)
    db.add_argument("--approve", action="store_true", help="required when exporting outside installer-owned evidence state")
    args = p.parse_args(argv)

    try:
        meta = _meta_command(args)
    except Exception as exc:
        return _print_meta_failure(exc)
    if meta is not None:
        return meta

    expected = _expected_action(args.cmd)
    try:
        journal = OperationJournal(
            "installer-kernel",
            args.cmd,
            operation_id=args.operation_id,
            correlation_id=args.correlation_id,
        )
        journal.start(expected, details={"kernel_version": __version__})
    except Exception as exc:
        print(
            json.dumps(
                {
                    "error": "observability unavailable; operation blocked before execution",
                    "failure_category": exc.__class__.__name__,
                    "observed_result": redact_text(str(exc)),
                },
                indent=2,
            ),
            file=sys.stderr,
        )
        return 70

    approval_required = args.cmd in {"apply", "rollback", "consent-write", "consent-update", "activate-runtime", "revoke-runtime-consent"} or (
        args.cmd == "diagnostic-bundle" and args.output is not None
    )
    if approval_required and not args.approve:
        finalized = _finish_terminal_or_report_unknown(
            journal,
            "blocked",
            "explicit mutation approval missing",
            expected_action=expected,
            execution_result="not_attempted",
            exit_code=2,
            failure_category="approval_required",
            rollback_eligible=False,
            recommended_next_action="review the requested mutation and retry only with explicit approval",
            details={"kernel_version": __version__},
        )
        if not finalized:
            return 70
        print(
            json.dumps(
                {
                    "error": "explicit approval required; no mutation attempted",
                    "failure_category": "approval_required",
                    "operation_id": journal.operation_id,
                    "correlation_id": journal.correlation_id,
                },
                indent=2,
            ),
            file=sys.stderr,
        )
        return 2

    try:
        if args.cmd == "consent-write":
            policy_raw = json.loads(args.policy.read_text(encoding="utf-8"))
            policy = compile_policy(policy_raw)
            receipt = write_receipt(policy, args.receipt)
            finalized = _finish_terminal_or_report_unknown(
                journal, "passed", "local permission receipt stored",
                expected_action=expected, execution_result="succeeded",
                do_not_retry_before_reconcile=True,
                changed_resources=[{"kind":"consent_receipt","path":redact_text(str(args.receipt))}],
                rollback_eligible=False,
                details={"kernel_version":__version__,"scopes":receipt["scopes"]},
            )
            if not finalized: return 70
            print(json.dumps(receipt, indent=2))
            return 0
        if args.cmd == "consent-update":
            policy_raw = json.loads(args.policy.read_text(encoding="utf-8"))
            receipt = replace_receipt(
                policy_raw, args.receipt, args.expected_consent_sha256
            )
            finalized = _finish_terminal_or_report_unknown(
                journal, "passed", "local permission receipt replaced with currentness check",
                expected_action=expected, execution_result="succeeded",
                do_not_retry_before_reconcile=True,
                changed_resources=[{"kind":"consent_receipt","path":redact_text(str(args.receipt))}],
                rollback_eligible=True,
                details={"kernel_version":__version__,"consent_sha256":receipt["consent_sha256"]},
            )
            if not finalized: return 70
            print(json.dumps(receipt, indent=2))
            return 0
        if args.cmd == "consent-status":
            receipt = read_receipt(args.receipt)
            finalized = _finish_terminal_or_report_unknown(
                journal, "passed", "local permission receipt read and verified",
                expected_action=expected, execution_result="succeeded",
                details={"kernel_version":__version__},
            )
            if not finalized: return 70
            print(json.dumps(receipt, indent=2))
            return 0
        if args.cmd == "consent-check":
            receipt = read_receipt(args.receipt)
            result = authorize(
                receipt, scope=args.scope, principal_ref=args.principal_ref,
                device_ref=args.device_ref, product_id=args.product_id, service_id=args.service_id,
            )
            finalized = _finish_terminal_or_report_unknown(
                journal, "passed" if result["state"]=="CONSENTED" else "blocked",
                "permission evaluation completed",
                expected_action=expected, execution_result="succeeded",
                details={"kernel_version":__version__,"scope":args.scope,"state":result["state"]},
            )
            if not finalized: return 70
            print(json.dumps(result, indent=2))
            return 0 if result["state"]=="CONSENTED" else 3
        if args.cmd == "service-activation":
            profile = load_service_profile(args.profile)
            consent = read_receipt(args.consent_receipt)
            result = compile_service_activation(
                profile, consent, principal_ref=args.principal_ref, device_ref=args.device_ref
            )
            finalized = _finish_terminal_or_report_unknown(
                journal, "passed", "service activation packet compiled",
                expected_action=expected, execution_result="succeeded",
                details={"kernel_version":__version__,"product_id":result.get("product_id")},
            )
            if not finalized: return 70
            print(json.dumps(result, indent=2))
            return 0
        if args.cmd == "update-authorize":
            request = load_update_request(args.request)
            consent = read_receipt(args.consent_receipt)
            result = authorize_update(
                request, consent, principal_ref=args.principal_ref, device_ref=args.device_ref
            )
            finalized = _finish_terminal_or_report_unknown(
                journal, "passed" if result["state"]=="AUTHORIZED_FOR_WARD_ADMISSION" else "blocked",
                "central update request evaluated against local permission",
                expected_action=expected, execution_result="succeeded",
                details={"kernel_version":__version__,"request_id":result["request_id"],"state":result["state"]},
            )
            if not finalized: return 70
            print(json.dumps(result, indent=2))
            return 0 if result["state"]=="AUTHORIZED_FOR_WARD_ADMISSION" else 3
        if args.cmd == "activate-runtime":
            profile = load_runtime_profile(args.runtime_profile)
            result = activate_runtime_profile(
                profile,
                grants=args.grant,
                update_policy=args.update_policy,
                consent_receipt_path=args.consent_receipt,
                activation_receipt_path=args.activation_receipt,
                principal_ref=args.principal_ref,
            )
            finalized = _finish_terminal_or_report_unknown(
                journal, "passed", "runtime profile activated with local consent and service readback",
                expected_action=expected, execution_result="succeeded",
                do_not_retry_before_reconcile=True, rollback_eligible=True,
                details={"kernel_version":__version__,"consent_ref":result.get("consent_ref")},
            )
            if not finalized: return 70
            print(json.dumps(result, indent=2))
            return 0
        if args.cmd == "revoke-runtime-consent":
            result = revoke_runtime_consent(args.consent_receipt)
            finalized = _finish_terminal_or_report_unknown(
                journal, "passed", "runtime managed-update consent revoked",
                expected_action=expected, execution_result="succeeded",
                do_not_retry_before_reconcile=True, rollback_eligible=False,
                details={"kernel_version":__version__},
            )
            if not finalized: return 70
            print(json.dumps(result, indent=2))
            return 0
        if args.cmd == "qualify-update":
            profile = load_runtime_profile(args.runtime_profile)
            consent = json.loads(args.consent_receipt.read_text(encoding="utf-8"))
            request = json.loads(args.update_request.read_text(encoding="utf-8"))
            result = qualify_update_request(profile, consent, request)
            finalized = _finish_terminal_or_report_unknown(
                journal, "passed" if result.get("state") != "DENIED" else "blocked",
                "central update request qualified against local runtime consent; no effect attempted",
                expected_action=expected, execution_result="not_attempted",
                rollback_eligible=False,
                details={"kernel_version":__version__,"update_state":result.get("state")},
            )
            if not finalized: return 70
            print(json.dumps(result, indent=2))
            return 0
        if args.cmd == "discover":
            result = discover_host()
            finalized = _finish_terminal_or_report_unknown(
                journal,
                "passed",
                "host discovery completed",
                expected_action=expected,
                execution_result="succeeded",
                details={"kernel_version": __version__},
            )
            if not finalized:
                return 70
            print(json.dumps(result, indent=2))
            return 0
        if args.cmd == "verify-payload":
            m = load_manifest(args.manifest)
            result = verify_payload(m, args.payload_root)
            finalized = _finish_terminal_or_report_unknown(
                journal,
                "passed",
                "payload custody verified",
                expected_action=expected,
                execution_result="succeeded",
                details={"kernel_version": __version__},
            )
            if not finalized:
                return 70
            print(json.dumps(result, indent=2))
            return 0
        if args.cmd == "plan":
            m = load_manifest(args.manifest)
            plan = plan_install(m, args.payload_root)
            finalized = _finish_terminal_or_report_unknown(
                journal,
                "passed",
                "installation plan compiled",
                expected_action=expected,
                execution_result="succeeded",
                changed_resources=_refs_from_items(plan),
                details={"kernel_version": __version__},
            )
            if not finalized:
                return 70
            print(json.dumps([x.__dict__ for x in plan], indent=2))
            return 0
        if args.cmd == "apply":
            m = load_manifest(args.manifest)
            receipt = apply_install(m, args.payload_root, args.receipt)
            finalized = _finish_terminal_or_report_unknown(
                journal,
                "passed",
                "approved installation transaction applied and receipted",
                expected_action=expected,
                execution_result="succeeded",
                do_not_retry_before_reconcile=True,
                changed_resources=_refs_from_items(receipt.get("entries", [])),
                rollback_eligible=True,
                details={"kernel_version": __version__},
            )
            if not finalized:
                return 70
            print(json.dumps(receipt, indent=2))
            return 0
        if args.cmd == "rollback":
            changed = _receipt_refs(args.receipt)
            rollback(args.receipt)
            finalized = _finish_terminal_or_report_unknown(
                journal,
                "rolled_back",
                "approved rollback completed and verified",
                expected_action=expected,
                execution_result="succeeded",
                do_not_retry_before_reconcile=True,
                changed_resources=changed,
                rollback_eligible=False,
                rollback_result="completed",
                details={"kernel_version": __version__},
            )
            if not finalized:
                return 70
            result = {"rolled_back": True, "receipt": redact_text(str(args.receipt))}
            print(json.dumps(result, indent=2))
            return 0
        if args.cmd == "diagnostic-bundle" and args.output is not None:
            result = diagnostic_bundle(
                args.source_operation_id,
                output_dir=args.output,
                external_output_approved=True,
            )
            finalized = _finish_terminal_or_report_unknown(
                journal,
                "passed",
                "approved external diagnostic bundle export completed",
                expected_action=expected,
                execution_result="succeeded",
                do_not_retry_before_reconcile=True,
                changed_resources=[{"kind": "diagnostic_bundle_export", "path": redact_text(str(args.output))}],
                rollback_eligible=False,
                details={"kernel_version": __version__, "source_operation_id": args.source_operation_id},
            )
            if not finalized:
                return 70
            print(json.dumps(result, indent=2))
            return 0
        raise RuntimeError(f"unsupported command: {args.cmd}")
    except Exception as exc:
        safe = redact_text(str(exc))
        try:
            journal.finish(
                "failed",
                safe or exc.__class__.__name__,
                expected_action=expected,
                exit_code=1,
                failure_category=exc.__class__.__name__,
                rollback_eligible=args.cmd in {"apply", "rollback", "activate-runtime"},
                recommended_next_action=f"inspect-operation {journal.operation_id}; export diagnostic bundle before retry",
                details={"kernel_version": __version__},
            )
            journal_error = None
        except Exception as journal_exc:
            journal_error = redact_text(str(journal_exc))
        payload = {
            "error": safe or exc.__class__.__name__,
            "failure_category": exc.__class__.__name__,
            "operation_id": journal.operation_id,
            "correlation_id": journal.correlation_id,
            "diagnostic_command": f"xi-io-installer diagnostic-bundle {journal.operation_id}",
        }
        if journal_error:
            payload["observability_finalization_error"] = journal_error
            payload["evidence_state"] = "unknown"
        print(json.dumps(payload, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
