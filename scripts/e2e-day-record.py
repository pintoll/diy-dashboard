#!/usr/bin/env python3
"""E2E check for the day-record stack (assistant phases 1-4).

Drives a RUNNING dev app through the agent API (journal, plan, fold, log),
then verifies journal ground truth by reading todos.db read-only. Boundary
arithmetic is unit-tested in src/shared/day.test.ts; this harness checks the
live wiring: routes <-> services <-> journal <-> rendered log.

Usage:
  scripts/e2e-day-record.py             scripted agent-source pass
  scripts/e2e-day-record.py --ui-check  verify a manual UI pass (run after
                                        creating/editing/completing todos by
                                        hand in the widget)

Env overrides (default: the WSL dev instance under ~/.config/diy-dashboard):
  E2E_API_FILE  path to agent-api.json
  E2E_DB        path to todos.db

Deliberately does NOT reuse dyd's discovery order (Windows AppData first):
this script writes scenario data and must never land on the real app's DB.
HTTP goes through curl (curl.exe when the API file lives under /mnt/) so the
same scenario can later run against the packaged Windows app from WSL.
"""

import json
import os
import re
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

CONFIG_DIR = os.path.expanduser("~/.config/diy-dashboard")
API_FILE = os.environ.get("E2E_API_FILE", os.path.join(CONFIG_DIR, "agent-api.json"))
DB_PATH = os.environ.get("E2E_DB", os.path.join(CONFIG_DIR, "todos.db"))

KST = timezone(timedelta(hours=9))
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


# Independent re-derivation of the app's 05:00 KST day (src/shared/day.ts).
# Duplicating the boundary is normally the drift the shared module forbids;
# here it is the point — the check compares two implementations.
def app_today() -> str:
    return (datetime.now(KST) - timedelta(hours=5)).strftime("%Y-%m-%d")


def day_window_iso(day: str) -> tuple[str, str]:
    start = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=KST) + timedelta(hours=5)
    end = start + timedelta(days=1)
    fmt = "%Y-%m-%dT%H:%M:%S.000Z"
    return (
        start.astimezone(timezone.utc).strftime(fmt),
        end.astimezone(timezone.utc).strftime(fmt),
    )


def shift_day(day: str, days: int) -> str:
    return (datetime.strptime(day, "%Y-%m-%d") + timedelta(days=days)).strftime(
        "%Y-%m-%d"
    )


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


# --- agent API via curl ------------------------------------------------------


class Api:
    def __init__(self, api_file: str):
        try:
            with open(api_file) as f:
                conn = json.load(f)
            self.port = conn["port"]
            self.token = conn["token"]
        except (OSError, ValueError, KeyError):
            sys.exit(f"cannot read {api_file} — is the dev app running? (pnpm dev)")
        self.curl = "curl.exe" if api_file.startswith("/mnt/") else "curl"

    def request(self, method, path, body=None, auth=True, token=None):
        args = [self.curl, "-s", "-S", "-o", "-", "-w", "\n%{http_code}", "-X", method]
        if auth:
            args += ["-H", f"Authorization: Bearer {token or self.token}"]
        if body is not None:
            args += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
        args.append(f"http://127.0.0.1:{self.port}{path}")
        proc = subprocess.run(args, capture_output=True, text=True)
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


# --- todos.db ground truth (read-only; WAL allows concurrent readers) --------


def q(sql: str, *params):
    try:
        con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, timeout=5)
    except sqlite3.OperationalError:
        con = sqlite3.connect(DB_PATH, timeout=5)
        con.execute("PRAGMA query_only=1")
    try:
        return con.execute(sql, params).fetchall()
    finally:
        con.close()


def q1(sql: str, *params):
    rows = q(sql, *params)
    return rows[0] if rows else None


def ops_total() -> int:
    return q1("SELECT COUNT(*) FROM ops")[0]


def last_todo_op(todo_id: str):
    """(op, before, after, source, reason_text, reason_source, session_id, seq)."""
    return q1(
        """SELECT o.op, o.before, o.after, o.source,
                  r.text, r.source, r.session_id, o.seq
           FROM ops o LEFT JOIN reasons r ON r.id = o.reason_id
           WHERE o.entity = 'todo' AND o.entity_id = ?
           ORDER BY o.seq DESC LIMIT 1""",
        todo_id,
    )


def changed_keys(before: dict, after: dict) -> set:
    keys = set(before) | set(after)
    keys.discard("updated_at")
    return {k for k in keys if before.get(k) != after.get(k)}


def error_of(body) -> str:
    return body.get("error", "") if isinstance(body, dict) else str(body)


# --- scripted pass -----------------------------------------------------------


def scripted_pass(api: Api) -> None:
    mark = "e2e" + datetime.now(KST).strftime("%H%M%S")
    today = app_today()
    print(f"run marker: [{mark}]  day: {today}")

    section("sanity")
    st, body = api.get("/api/health", auth=False)
    check(st == 200 and isinstance(body, dict) and body.get("ok") is True,
          "GET /api/health responds", (st, body))
    st, body = api.get("/api/today")
    check(st == 200 and body.get("date") == today,
          "/api/today matches an independent 05:00 KST derivation",
          f"api={body.get('date')} expected={today}")
    st, _ = api.get("/api/todos", token="not-the-token")
    check(st == 401, "bad bearer token -> 401", st)

    section("journal: reasoned create")
    t1_title = f"[{mark}] reasoned create"
    r1 = f"[{mark}] seed the day"
    st, body = api.post("/api/todos", {"title": t1_title, "reason": r1})
    if not check(st == 201, "POST /api/todos -> 201", (st, body)):
        sys.exit(summarize())
    t1 = body["todo"]["id"]
    op = last_todo_op(t1)
    check(op and op[0] == "create" and op[1] is None
          and json.loads(op[2])["title"] == t1_title,
          "create op journaled: null -> full row snapshot", op)
    check(op and op[3] == "agent" and op[4] == r1
          and op[5] == "agent" and op[6] is None,
          "reason row minted and referenced (agent, no session)", op)
    t1_create_seq = op[7]

    section("journal: no-change patch mints nothing")
    r_noop = f"[{mark}] should not appear"
    ops_before = ops_total()
    st, _ = api.patch(f"/api/todos/{t1}", {"title": t1_title, "reason": r_noop})
    check(st == 200, "no-change PATCH -> 200", st)
    check(ops_total() == ops_before, "no-change patch journals no op")
    check(q1("SELECT COUNT(*) FROM reasons WHERE text = ?", r_noop)[0] == 0,
          "unused reason row is never minted (lazy mint)")

    section("journal: real update")
    r2 = f"[{mark}] annotate"
    st, body = api.patch(f"/api/todos/{t1}", {"note": "note v1", "reason": r2})
    check(st == 200 and body["todo"]["note"] == "note v1", "PATCH note -> 200", body)
    op = last_todo_op(t1)
    before, after = json.loads(op[1]), json.loads(op[2])
    check(op[0] == "update" and before["note"] is None and after["note"] == "note v1",
          "update op snapshots the note change", op)
    check(changed_keys(before, after) == {"note"},
          "diff is exactly {note} (updated_at ignored)",
          changed_keys(before, after))
    check(op[4] == r2, "update op carries its reason", op[4])

    section("backlog un-park on completion")
    t2_title = f"[{mark}] parked idea"
    st, body = api.post("/api/todos",
                        {"title": t2_title, "date": None,
                         "reason": f"[{mark}] park an idea"})
    check(st == 201 and body["todo"]["date"] is None, "backlog create (date null)", body)
    t2 = body["todo"]["id"]
    st, body = api.get("/api/todos/backlog")
    check(any(t["id"] == t2 for t in body["todos"]), "backlog list shows it")
    st, body = api.patch(f"/api/todos/{t2}",
                         {"done": True, "reason": f"[{mark}] finish parked"})
    todo = body["todo"]
    check(st == 200 and todo["done"] is True and todo["date"] == today
          and todo["completedOn"] == today,
          "completion un-parks onto today and stamps completedOn", todo)
    op = last_todo_op(t2)
    before, after = json.loads(op[1]), json.loads(op[2])
    check(before["date"] is None and after["date"] == today
          and after["completed_on"] == today,
          "un-park journaled with both date and completed_on", (before, after))

    section("plan entries")
    st, body = api.post("/api/plan",
                        {"todoId": t1, "day": today, "start": "09:00",
                         "end": "10:30", "reason": f"[{mark}] plan morning"})
    check(st == 201, "POST /api/plan -> 201", (st, body))
    p1 = body["entry"]["id"]
    st, body = api.post("/api/plan",
                        {"todoId": t1, "date": today,
                         "start": "11:00", "end": "12:00"})
    check(st == 400 and "unknown key" in error_of(body),
          "strict keys: 'date' for 'day' -> 400", body)
    st, body = api.post("/api/plan",
                        {"todoId": t1, "day": today,
                         "start": "09:00", "end": "09:00"})
    check(st == 400, "zero-length range -> 400", (st, body))
    st, body = api.post("/api/plan",
                        {"todoId": "no-such-todo", "day": today,
                         "start": "09:00", "end": "10:00"})
    check(st == 404, "dangling todoId -> 404", (st, body))
    st, body = api.post("/api/plan",
                        {"todoId": t1, "day": today, "start": "23:30",
                         "end": "01:00", "reason": f"[{mark}] plan night"})
    check(st == 201, "midnight wrap (23:30-01:00) accepted", (st, body))
    p2 = body["entry"]["id"]
    st, body = api.post("/api/plan",
                        {"todoId": t2, "day": today, "start": "05:00",
                         "end": "05:00", "reason": f"[{mark}] plan whole day"})
    check(st == 201, "05:00-05:00 whole-day entry accepted", (st, body))
    p3 = body["entry"]["id"]
    st, body = api.get(f"/api/plan?date={today}")
    ours = [e["id"] for e in body["entries"] if e["id"] in (p1, p2, p3)]
    check(ours == [p3, p1, p2],
          "lived order: whole-day 05:00, then 09:00, then 23:30", ours)
    st, body = api.patch(f"/api/plan/{p1}", {"todoId": t2})
    check(st == 400, "retiming-only: 'todoId' patch -> 400", (st, body))
    st, body = api.patch(f"/api/plan/{p1}",
                         {"start": "09:15", "end": "10:30",
                          "reason": f"[{mark}] retime"})
    check(st == 200 and body["entry"]["start"] == "09:15", "retime -> 200", body)
    op = q1(
        """SELECT o.op, o.before, o.after FROM ops o
           WHERE o.entity = 'plan' AND o.entity_id = ?
           ORDER BY o.seq DESC LIMIT 1""", p1)
    check(op[0] == "update" and json.loads(op[1])["start"] == "09:00"
          and json.loads(op[2])["start"] == "09:15",
          "plan update op snapshots the retime", op)
    st, _ = api.delete(f"/api/plan/{p3}?reason=" + quote(f"[{mark}] drop whole day"))
    check(st == 204, "DELETE /api/plan/:id -> 204", st)
    op = q1(
        """SELECT o.op, r.text FROM ops o
           LEFT JOIN reasons r ON r.id = o.reason_id
           WHERE o.entity = 'plan' AND o.entity_id = ?
           ORDER BY o.seq DESC LIMIT 1""", p3)
    check(op == ("delete", f"[{mark}] drop whole day"),
          "direct plan delete journaled with query-param reason", op)

    section("delete sweep")
    r_drop = f"[{mark}] drop t1"
    st, _ = api.delete(f"/api/todos/{t1}?reason=" + quote(r_drop))
    check(st == 204, "DELETE /api/todos/:id -> 204", st)
    rows = q(
        """SELECT o.seq, o.entity, o.entity_id, o.at, o.before FROM ops o
           JOIN reasons r ON r.id = o.reason_id WHERE r.text = ?
           ORDER BY o.seq""", r_drop)
    check(len(rows) == 3, "sweep journals 3 ops under one reason", rows)
    if len(rows) == 3:
        check([r[1] for r in rows] == ["plan", "plan", "todo"],
              "plan sweeps append before the todo delete",
              [r[1] for r in rows])
        check([r[2] for r in rows[:2]] == [p1, p2],
              "swept entries in insertion order", [r[2] for r in rows[:2]])
        check(len({r[3] for r in rows}) == 1,
              "one shared at stamp across the intent", [r[3] for r in rows])
        check(json.loads(rows[2][4])["title"] == t1_title,
              "todo delete snapshot keeps the title")
    sweep_first_seq = rows[0][0] if rows else None
    st, body = api.get(f"/api/plan?date={today}")
    check(not any(e["id"] in (p1, p2, p3) for e in body["entries"]),
          "plan is clear of swept entries")
    st, body = api.get(f"/api/todos?date={today}")
    check(not any(t["id"] == t1 for t in body["todos"]), "t1 is gone from today")

    section("fold")
    ops_before = ops_total()
    remark = f"[{mark}] fold remark"
    st, body = api.post(f"/api/days/{today}/fold", {"remarks": remark})
    fold = body.get("fold") if isinstance(body, dict) else None
    check(st == 200 and fold and fold["day"] == today and fold["remarks"] == remark,
          "POST fold -> 200 with remarks", (st, body))
    snap = json.dumps(fold["snapshot"]) if fold else ""
    check(t2_title in snap, "snapshot includes the completed (un-parked) todo")
    check(t1_title not in snap, "deleted todo dropped out of the snapshot")
    check(ops_total() == ops_before, "folds are not journaled")
    st, body = api.post(f"/api/days/{today}/fold", {})
    check(st == 200 and body["fold"]["remarks"] == remark,
          "re-fold with empty body keeps remarks (snapshot refresh)", body)
    st, body = api.post(f"/api/days/{shift_day(today, 1)}/fold", {})
    check(st == 400, "future fold -> 400", (st, body))
    st, body = api.get(f"/api/days/{today}")
    check(st == 200 and body.get("fold") is not None
          and isinstance(body.get("plan"), list),
          "GET /api/days/:day returns plan + fold", body)
    st, body = api.get("/api/yesterday")
    check(st == 200 and (body["date"] is None or DATE_RE.match(body["date"])),
          "GET /api/yesterday shape", body)

    section("unreasoned agent op")
    st, _ = api.delete(f"/api/todos/{t2}")
    check(st == 204, "cleanup delete t2 -> 204", st)
    row = q1(
        """SELECT reason_id, source, seq FROM ops
           WHERE entity = 'todo' AND entity_id = ? AND op = 'delete'""", t2)
    check(row and row[0] is None and row[1] == "agent",
          "reasonless agent op journals with NULL reason", row)
    t2_delete_seq = row[2] if row else None

    section("log view")
    st, body = api.get(f"/api/days/{today}/log")
    check(st == 200 and body.get("day") == today, "GET /api/days/:day/log", st)
    lines = body["lines"]
    reasoned = [l for l in lines if l.get("reason", "").startswith(f"[{mark}]")]
    check(len(reasoned) == 10, "one line per reasoned intent (10 expected)",
          [l.get("reason") for l in reasoned])
    l1 = next((l for l in lines if l.get("reason") == r1), None)
    check(l1 and l1["seq"] == t1_create_seq and t1_title in l1["text"],
          "reasoned line anchors at the group's first op and names the todo", l1)
    sweep_lines = [l for l in lines if l.get("reason") == r_drop]
    check(len(sweep_lines) == 1
          and sweep_lines[0]["seq"] == sweep_first_seq,
          "delete sweep fuses into one line, anchored at its first op",
          sweep_lines)
    check(sweep_lines and t1_title in sweep_lines[0]["text"],
          "deleted todo's title resolves from the journal snapshot",
          sweep_lines)
    mech = next((l for l in lines if l["seq"] == t2_delete_seq), None)
    check(mech and "reason" not in mech and t2_title in mech["text"]
          and mech["source"] == "agent",
          "reasonless op renders mechanically (no reason field)", mech)
    check(not any("should not appear" in (l.get("reason", "") + l["text"])
                  for l in lines),
          "the no-change patch left no trace in the log")
    check(all(re.fullmatch(r"\d{2}:\d{2}", l["time"]) for l in lines),
          "line times render as HH:MM")
    st, body = api.get(f"/api/days/{shift_day(today, -1)}/log")
    check(st == 200 and not any(mark in (l.get("reason", "") + l["text"])
                                for l in body["lines"]),
          "today's ops stay out of yesterday's window")

    print("\nscripted pass done. Next: make a few edits in the widget by hand")
    print("(create, edit, complete a todo), then run:")
    print("  scripts/e2e-day-record.py --ui-check")


# --- manual UI pass verification --------------------------------------------


def ui_check(api: Api) -> None:
    today = app_today()
    start, end = day_window_iso(today)
    rows = q(
        """SELECT seq, entity, op, reason_id FROM ops
           WHERE source = 'user' AND at >= ? AND at < ? ORDER BY seq""",
        start, end)
    if not rows:
        print("no user-source ops today yet — create/edit/complete a todo in"
              " the widget first, then rerun.")
        sys.exit(1)
    section("UI (user-source) ops")
    check(all(r[3] is None for r in rows),
          f"all {len(rows)} user ops today carry no reason", rows)
    st, body = api.get(f"/api/days/{today}/log")
    user_lines = [l for l in body["lines"] if l["source"] == "user"]
    check(st == 200 and user_lines, "user ops render in the day log")
    check(all("reason" not in l for l in user_lines),
          "user lines are mechanical (no reason field)")
    print("\nrendered user lines (eyeball these):")
    for l in user_lines:
        print(f"  {l['time']}  {l['text']}")


def main() -> None:
    api = Api(API_FILE)
    if "--ui-check" in sys.argv:
        ui_check(api)
    else:
        scripted_pass(api)
    sys.exit(summarize())


if __name__ == "__main__":
    main()
