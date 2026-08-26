"""Shared harness for the e2e scripts that drive a RUNNING dev app.

Both e2e-day-record.py and e2e-apply.py reach the app the same way — the agent
API over curl, plus todos.db read-only for ground truth — so the connection,
the request, and the check bookkeeping live here once. They had drifted: only
one of them checked curl's exit status, and the other crashed with an unpack
error instead of saying the app was not running.

Discovery is deliberately NOT dyd's order (Windows AppData first): these
scripts write scenario data and must never land on the real app's DB.

Env overrides:
  E2E_API_FILE  path to agent-api.json
  E2E_DB        path to todos.db
"""

import json
import os
import subprocess
import sys
from typing import Any

CONFIG_DIR = os.path.expanduser("~/.config/diy-dashboard")
API_FILE = os.environ.get("E2E_API_FILE", os.path.join(CONFIG_DIR, "agent-api.json"))
DB_PATH = os.environ.get("E2E_DB", os.path.join(CONFIG_DIR, "todos.db"))


class Api:
    """The agent API over curl — curl.exe when the API file lives under /mnt/,
    so the same scenario can later run against the packaged Windows app."""

    def __init__(self, api_file: str = API_FILE):
        try:
            with open(api_file) as f:
                conn = json.load(f)
            self.port = conn["port"]
            self.token = conn["token"]
        except (OSError, ValueError, KeyError):
            sys.exit(f"cannot read {api_file} — is the dev app running? (pnpm dev)")
        self.curl = "curl.exe" if api_file.startswith("/mnt/") else "curl"

    def request(
        self,
        method: str,
        path: str,
        body: Any = None,
        auth: bool = True,
        token: str | None = None,
    ) -> tuple[int, Any]:
        args = [self.curl, "-s", "-S", "-o", "-", "-w", "\n%{http_code}", "-X", method]
        if auth:
            args += ["-H", f"Authorization: Bearer {token or self.token}"]
        if body is not None:
            args += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
        args.append(f"http://127.0.0.1:{self.port}{path}")
        proc = subprocess.run(args, capture_output=True, text=True)
        # A stale agent-api.json outlives a crashed app, so the connection
        # failure surfaces here rather than at the file check — say so, instead
        # of unpacking empty output into a ValueError.
        if proc.returncode != 0:
            sys.exit(f"curl failed — is the app running? ({proc.stderr.strip()})")
        raw, _, status = proc.stdout.rpartition("\n")
        try:
            parsed = json.loads(raw) if raw else None
        except ValueError:
            parsed = raw
        return int(status), parsed

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, body, **kw):
        return self.request("POST", path, body=body, **kw)

    def patch(self, path, body, **kw):
        return self.request("PATCH", path, body=body, **kw)

    def delete(self, path, **kw):
        return self.request("DELETE", path, **kw)


# --- check bookkeeping -------------------------------------------------------

RESULTS: list[tuple[bool, str]] = []


def section(title: str) -> None:
    print(f"\n== {title}")


def check(ok: object, desc: str, detail: object = "") -> bool:
    ok = bool(ok)
    RESULTS.append((ok, desc))
    line = f"  [{'PASS' if ok else 'FAIL'}] {desc}"
    if not ok and detail != "":
        line += f"\n         {detail}"
    print(line)
    return ok


def summarize() -> int:
    failed = [desc for ok, desc in RESULTS if not ok]
    print(f"\n{'-' * 60}")
    print(f"{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    for desc in failed:
        print(f"  FAIL: {desc}")
    return 1 if failed else 0
