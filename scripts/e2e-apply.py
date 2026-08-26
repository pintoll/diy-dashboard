#!/usr/bin/env python3
"""E2E check for the assistant batch write (phase 7: POST /api/apply).

Drives a RUNNING dev app through the agent API and verifies journal ground
truth by reading todos.db read-only. The pure parser is unit-tested in
src/main/todos/apply-ops.test.ts; this harness checks the live wiring:
route <-> executor <-> savepoints <-> journal <-> rendered log.

Usage:
  scripts/e2e-apply.py

Connection, request, and check bookkeeping come from e2e_common (shared with
e2e-day-record.py), including the env overrides E2E_API_FILE and E2E_DB.
"""

import os
import sqlite3
import sys

from e2e_common import DB_PATH, Api, check, section, summarize


def db() -> sqlite3.Connection:
    c = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    c.row_factory = sqlite3.Row
    return c


def main() -> int:
    api = Api()
    # Unique per run: the rendered-log check counts lines carrying this exact
    # reason, and reruns against the same dev DB must not trip it.
    run = f"e2e-apply[{os.getpid()}]"
    ids: list[str] = []
    day = None

    try:
        section("happy path: split-style intent, one reason, $N refs")
        status, resp = api.post("/api/apply", {
            "reason": f"{run}: split C into C-1 and C-2",
            "sessionId": "e2e-apply-session",
            "ops": [
                {"op": "todo.create", "title": f"{run} C-1"},
                {"op": "todo.create", "title": f"{run} C-2"},
                {"op": "plan.create", "todoId": "$0", "start": "10:00", "end": "12:00"},
                {"op": "todo.update", "id": "$1", "note": "split from C"},
            ],
        })
        check(status == 200, "apply returns 200", (status, resp))
        check(resp and len(resp["results"]) == 4, "4 results in batch order")
        check(resp and resp["reasonId"], "reasonId minted")
        # The two creates only — the update also returns {"todo"}, same row as C-2.
        ids = [r["todo"]["id"] for r in resp["results"][:2]] if resp else []
        entry = resp["results"][2].get("entry", {}) if resp else {}
        check(entry.get("todoId") == (ids[0] if ids else None),
              "$0 resolved to first create")

        section("journal ground truth")
        with db() as c:
            reason = c.execute("SELECT * FROM reasons WHERE id = ?",
                               (resp["reasonId"],)).fetchone()
            check(reason and reason["source"] == "assistant",
                  "reason source is assistant")
            check(reason and reason["session_id"] == "e2e-apply-session",
                  "sessionId journaled")
            ops = c.execute("SELECT * FROM ops WHERE reason_id = ? ORDER BY seq",
                            (resp["reasonId"],)).fetchall()
            check(len(ops) == 4, "4 ops share the reason row", len(ops))
            check(len({o["at"] for o in ops}) == 1, "one shared at stamp")
            check(all(o["source"] == "assistant" for o in ops),
                  "ops source is assistant")

        section("rendered log collapses the batch to one line")
        day = api.get("/api/today")[1]["date"]
        _, log = api.get(f"/api/days/{day}/log")
        lines = [l for l in log["lines"] if f"{run}: split" in l["text"]]
        check(len(lines) == 1, "one [assistant] line for the whole batch", log["lines"])
        check(lines and lines[0]["source"] == "assistant", "line tagged assistant")

        section("atomicity: mid-batch failure rolls everything back")
        status, err = api.post("/api/apply", {
            "reason": f"{run}: should roll back",
            "ops": [
                {"op": "todo.create", "title": f"{run} GHOST"},
                {"op": "plan.create", "todoId": "$0", "start": "25:99", "end": "26:00"},
            ],
        })
        check(status == 400, "bad plan time is a 400", (status, err))
        _, todos = api.get("/api/todos")
        check(not any(t["title"] == f"{run} GHOST" for t in todos["todos"]),
              "first op rolled back with the batch")

        section("validation")
        for body, what in [
            ({"reason": "x", "ops": [{"op": "todo.delete", "id": "$0"}]}, "forward ref"),
            ({"reason": "x",
              "ops": [{"op": "todo.create", "title": "t", "day": "2026-01-01"}]},
             "unknown key"),
            ({"reason": "x", "ops": [{"op": "todo.finish", "id": "a"}]}, "unknown op"),
            ({"ops": [{"op": "todo.create", "title": "t"}]}, "missing reason"),
            ({"reason": "x", "ops": []}, "empty ops"),
        ]:
            status, err = api.post("/api/apply", body)
            check(status == 400, f"{what} is a 400", (status, err))

        section("the single-op routes share the batch's key policy")
        status, err = api.post("/api/todos", {"title": f"{run} strict", "day": day})
        check(status == 400, "POST /api/todos rejects 'day' the way /api/apply does",
              (status, err))
        if ids:
            status, err = api.patch(f"/api/todos/{ids[0]}", {"tilte": "typo"})
            check(status == 400, "PATCH /api/todos/:id rejects a misnamed field",
                  (status, err))

        section("GET /api/todos/by-ids")
        status, got = api.get(f"/api/todos/by-ids?ids={','.join(ids)}")
        check(status == 200 and {t["id"] for t in got["todos"]} == set(ids),
              "resolves both created todos", got)
        status, _ = api.get("/api/todos/by-ids")
        check(status == 400, "missing ids is a 400", status)
    finally:
        # Runs even when the scenario dies mid-way: scenario todos left in the
        # dev DB would pollute the day sheet and every later run.
        if ids:
            section("cleanup: reasoned delete batch sweeps the plan entry")
            status, resp = api.post("/api/apply", {
                "reason": f"{run} cleanup",
                "ops": [{"op": "todo.delete", "id": i} for i in ids],
            })
            check(status == 200, "cleanup applied", (status, resp))
            if day:
                _, plan = api.get(f"/api/plan?date={day}")
                check(not any(e["todoId"] in ids for e in plan["entries"]),
                      "plan entry swept")

    return summarize()


if __name__ == "__main__":
    sys.exit(main())
