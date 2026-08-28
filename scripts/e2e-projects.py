#!/usr/bin/env python3
"""E2E check for the projects steering layer over the agent API (phase 4).

Covers what the pure parser cannot: the batch executor's project ops, the
stats route's rollup, and the fold snapshot's project attribution. Drives a
RUNNING dev app and verifies journal ground truth by reading todos.db
read-only. The parser itself is unit-tested in src/main/todos/apply-ops.test.ts.

Usage:
  scripts/e2e-projects.py

Connection, request, and check bookkeeping come from e2e_common (shared with
e2e-apply.py and e2e-day-record.py), including E2E_API_FILE and E2E_DB.
"""

import os
import sqlite3
import sys
from typing import Any

from e2e_common import DB_PATH, Api, check, section, summarize


def db() -> sqlite3.Connection:
    c = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    c.row_factory = sqlite3.Row
    return c


class Bail(Exception):
    """Stop the scenario after a FAIL that later checks depend on.

    Raised instead of returning so the finally-cleanup runs (and prints)
    before summarize(), keeping the summary the last thing on screen.
    """


def rows(body: Any, key: str) -> list[Any]:
    """The list at body[key], or [] when the response was error-shaped.

    Api.request returns the parsed error body on a non-200, so expressions
    inside check() arguments must not index into it — a KeyError there would
    kill the run before summarize() can print what failed.
    """
    if isinstance(body, dict) and isinstance(body.get(key), list):
        return body[key]
    return []


def main() -> int:
    api = Api()
    # Unique per run: this writes into the real dev DB, and the log check
    # counts lines carrying this exact reason.
    run = f"e2e-projects[{os.getpid()}]"
    projects: list[str] = []
    todos: list[str] = []

    try:
        section("apply: project.create (seeded notes) + project_doc.create with $N")
        status, resp = api.post("/api/apply", {
            "reason": f"{run}: open the project and its decision log",
            "sessionId": "e2e-projects-session",
            "ops": [
                {"op": "project.create", "title": f"{run} P",
                 "outcome": "phase 4 merged", "targetDate": "2026-12-31",
                 "notes": "seeded at birth"},
                {"op": "project_doc.create", "projectId": "$0",
                 "title": "decisions", "body": "why sqlite"},
                {"op": "todo.create", "title": f"{run} next action",
                 "date": None, "projectId": "$0"},
            ],
        })
        check(status == 200, "apply returns 200", (status, resp))
        # Everything below indexes into this batch's results; a FAIL here must
        # jump to the summary instead of dying in a KeyError halfway (the
        # finally-cleanup still runs either way).
        if not check(len(rows(resp, "results")) == 3,
                     "3 results in batch order", resp):
            raise Bail()
        pid = resp["results"][0]["project"]["id"]
        doc = resp["results"][1]["doc"]
        projects.append(pid)
        todos.append(resp["results"][2]["todo"]["id"])
        check(doc.get("projectId") == pid, "$0 resolved to the created project",
              (doc.get("projectId"), pid))
        check(resp["results"][2]["todo"]["projectId"] == pid,
              "todo.create filed under the same $0")

        section("journal: one reason, and project.create also journals its notes doc")
        with db() as c:
            ops = c.execute(
                "SELECT * FROM ops WHERE reason_id = ? ORDER BY seq",
                (resp["reasonId"],)).fetchall()
            kinds = [(o["entity"], o["op"]) for o in ops]
            # project.create mints the default `notes` doc in the same
            # transaction and context, so it is 4 ops for 3 declared ops.
            check(kinds == [("project", "create"), ("project_doc", "create"),
                            ("project_doc", "create"), ("todo", "create")],
                  "project create journals its notes doc too", kinds)
            check(len({o["at"] for o in ops}) == 1, "one shared at stamp")
            check(all(o["source"] == "assistant" for o in ops),
                  "ops source is assistant")

        section("the notes doc is reachable, seeded, and append extends it")
        status, docs = api.get(f"/api/projects/{pid}/docs")
        doc_rows = rows(docs, "docs")
        notes = next((d for d in doc_rows if d["title"] == "notes"), None)
        if not check(notes is not None, "default notes doc exists", docs):
            raise Bail()
        assert notes is not None
        check(notes["body"] == "seeded at birth",
              "project.create's notes field seeded the default doc", notes)
        check(len(doc_rows) == 2, "plus the batched decisions doc")
        status, resp = api.post("/api/apply", {
            "reason": f"{run}: worklog line",
            "ops": [{"op": "project_doc.update", "id": notes["id"],
                     "append": "2026-08-28: wired the apply entities"}],
        })
        check(status == 200, "append applied", (status, resp))
        check(status == 200 and resp["results"][0]["doc"]["body"].endswith(
            "2026-08-28: wired the apply entities"), "append landed on the body")

        section("stats rollup")
        status, st = api.get("/api/projects/stats")
        check(status == 200, "GET /api/projects/stats returns 200", status)
        mine = next((s for s in rows(st, "stats") if s["projectId"] == pid),
                    None)
        if not check(mine is not None, "the new project is in the rollup"):
            raise Bail()
        assert mine is not None
        check(mine["total"] == 1 and mine["openBacklog"] == 1,
              "counts its one backlog todo", mine)
        check(mine["nextAction"] and mine["nextAction"]["id"] == todos[0],
              "nextAction is the backlog head", mine)
        check(mine["isStale"] is False,
              "a project written to today is not stale", mine)
        check(isinstance(st, dict) and isinstance(st.get("inboxCount"), int),
              "stats carries the inbox badge count", st)
        _, all_projects = api.get("/api/projects")
        check(len(rows(st, "stats")) == len(rows(all_projects, "projects")),
              "one stats row per project",
              (len(rows(st, "stats")), len(rows(all_projects, "projects"))))

        section("nextAction agrees with the project's own backlog head")
        _, lists = api.get(f"/api/projects/{pid}/todos")
        backlog = rows(lists, "backlog")
        check(backlog and mine["nextAction"]
              and backlog[0]["id"] == mine["nextAction"]["id"],
              "listProjectTodos and the rollup pick the same todo")

        section("atomicity: a mid-batch failure rolls the project back")
        status, err = api.post("/api/apply", {
            "reason": f"{run}: should roll back",
            "ops": [
                {"op": "project.create", "title": f"{run} GHOST"},
                {"op": "project_doc.update", "id": notes["id"],
                 "body": "x", "append": "y"},
            ],
        })
        check(status == 400, "body+append together is a 400", (status, err))
        _, after = api.get("/api/projects")
        check(not any(p["title"] == f"{run} GHOST"
                      for p in rows(after, "projects")),
              "the project created before the failing op is gone")

        section("validation")
        for body, what in [
            ({"reason": "x", "ops": [{"op": "project.update", "id": "z"}]},
             "empty project patch"),
            ({"reason": "x", "ops": [{"op": "project.create", "title": "t",
                                      "note": "x"}]}, "unknown project key"),
            ({"reason": "x", "ops": [
                {"op": "todo.create", "title": "t"},
                {"op": "project_doc.create", "projectId": "$0", "title": "d"}]},
             "doc create pointed at a todo create"),
            ({"reason": "x", "ops": [{"op": "project.update", "id": "nope",
                                      "status": "someday"}]}, "unknown project id"),
            # Titles are addresses within a project (dyd's --doc), so a
            # duplicate is rejected rather than left to rot unreachably...
            ({"reason": "x", "ops": [{"op": "project_doc.create",
                                      "projectId": pid, "title": "decisions"}]},
             "duplicate doc title on one project"),
            # ...including the old silent-duplicate path: batching a second
            # `notes` next to project.create. The `notes` create field is the
            # supported way to seed it.
            ({"reason": "x", "ops": [
                {"op": "project.create", "title": f"{run} DUP"},
                {"op": "project_doc.create", "projectId": "$0",
                 "title": "notes"}]},
             "batched second notes doc"),
        ]:
            status, err = api.post("/api/apply", body)
            check(status in (400, 404), f"{what} is rejected", (status, err))

        section("rendered log collapses each batch to one line")
        day = api.get("/api/today")[1]["date"]
        _, log = api.get(f"/api/days/{day}/log")
        lines = [l for l in rows(log, "lines")
                 if f"{run}: open the project" in l["text"]]
        check(len(lines) == 1, "one [assistant] line for the create batch",
              [l["text"] for l in rows(log, "lines")][-6:])
    except Bail:
        pass
    finally:
        # Runs even when the scenario dies mid-way: scenario rows left in the
        # dev DB would pollute the projects page and every later run.
        if projects or todos:
            section("cleanup")
            ops = [{"op": "todo.delete", "id": i} for i in todos]
            ops += [{"op": "project.delete", "id": i} for i in projects]
            status, resp = api.post("/api/apply",
                                    {"reason": f"{run} cleanup", "ops": ops})
            check(status == 200, "cleanup applied", (status, resp))
            _, left = api.get("/api/projects")
            check(not any(p["id"] in projects for p in rows(left, "projects")),
                  "scenario projects removed")

    return summarize()


if __name__ == "__main__":
    sys.exit(main())
