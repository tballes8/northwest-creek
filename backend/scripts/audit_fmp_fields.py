"""
FMP /stable/ field-name audit — CLI.

Verifies that the response field names the endpoint registry documents actually
exist in *live* /stable/ responses. Reading a stale name off a /stable/ response
returns None silently (e.g. v3-era `mktCap` vs stable `marketCap`) — a latent bug
with no error. This is the active counterpart to changelog_review.py.

The audit logic lives in app/services/fmp_field_audit.py (shared with the weekly
scheduled job app/tasks/audit_fmp_fields_task.py). This file is just the CLI:
it loads the API key from env / backend/.env and prints the report.

Run from backend/ with MASSIVE_API_KEY available (export it or put it in backend/.env):

    python scripts/audit_fmp_fields.py                # full report
    python scripts/audit_fmp_fields.py --json         # machine-readable
    python scripts/audit_fmp_fields.py profile quote  # only these paths

Exit code is non-zero if any registry key_field is MISSING from a live response,
so this can gate CI.
"""
import argparse
import asyncio
import json
import os
import sys

# Make `app` importable when run as `python scripts/audit_fmp_fields.py` from backend/.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)

# Shared core — depends only on httpx + stdlib + the pure registry (no app.config).
from app.services.fmp_field_audit import run_audit, format_text_report, summarize  # noqa: E402


def _load_api_key() -> str:
    """MASSIVE_API_KEY from the environment, falling back to backend/.env."""
    key = os.environ.get("MASSIVE_API_KEY", "").strip()
    if key:
        return key
    env_path = os.path.join(_BACKEND_DIR, ".env")
    try:
        with open(env_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("MASSIVE_API_KEY="):
                    return line.split("=", 1)[1].strip().strip("'\"")
    except OSError:
        pass
    return ""


API_KEY = _load_api_key()


def main() -> int:
    ap = argparse.ArgumentParser(description="Audit FMP /stable/ field names against the registry.")
    ap.add_argument("paths", nargs="*", help="Only audit these endpoint paths (default: all).")
    ap.add_argument("--json", action="store_true", help="Emit JSON instead of a human report.")
    args = ap.parse_args()

    # Best-effort UTF-8 stdout so stray non-ASCII in field data can't crash the
    # run on a Windows cp1252 console.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

    if not API_KEY:
        print("ERROR: MASSIVE_API_KEY is not set (env or backend/.env) - cannot hit the FMP API.",
              file=sys.stderr)
        return 2

    results = asyncio.run(run_audit(API_KEY, paths=args.paths or None))

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print(format_text_report(results))

    return 1 if summarize(results)["missing"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
