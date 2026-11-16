from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .managed_update import apply_managed_runtime_update
from .redaction import redact_text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="xi-io-installer-update")
    parser.add_argument("current_profile", type=Path)
    parser.add_argument("target_profile", type=Path)
    parser.add_argument("consent_receipt", type=Path)
    parser.add_argument("activation_receipt", type=Path)
    parser.add_argument("update_request", type=Path)
    parser.add_argument("admission_receipt", type=Path)
    parser.add_argument("update_receipt", type=Path)
    parser.add_argument("--approve", action="store_true", help="required for the admitted local mutation")
    args = parser.parse_args(argv)

    if not args.approve:
        print(json.dumps({
            "state": "BLOCKED",
            "first_red": "EXPLICIT_MUTATION_APPROVAL_REQUIRED",
            "provider_effect": False,
        }, indent=2), file=sys.stderr)
        return 2
    try:
        result = apply_managed_runtime_update(
            args.current_profile,
            args.target_profile,
            args.consent_receipt,
            args.activation_receipt,
            args.update_request,
            args.admission_receipt,
            args.update_receipt,
        )
    except Exception as exc:
        print(json.dumps({
            "state": "BLOCKED",
            "first_red": redact_text(str(exc)) or exc.__class__.__name__,
            "provider_effect": False,
        }, indent=2), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
