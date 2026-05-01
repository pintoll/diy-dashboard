#!/usr/bin/env python3
"""Run SQL against a (snapshotted) SQLite DB and print rows in column format.

Usage:
    sqlite_query.py <db_path> "<SQL>"
    sqlite_query.py <db_path>  < SQL_on_stdin
"""
import sqlite3
import sys


def fmt_rows(cur):
    rows = cur.fetchall()
    if not rows:
        msg = f"({cur.rowcount} rows)" if cur.rowcount >= 0 else "(no rows)"
        print(msg)
        return
    cols = rows[0].keys()

    def cell(v):
        if v is None:
            return ""
        s = str(v)
        return s if len(s) <= 200 else s[:197] + "..."

    widths = [max(len(c), max(len(cell(r[c])) for r in rows)) for c in cols]
    print("  ".join(c.ljust(w) for c, w in zip(cols, widths)))
    print("  ".join("-" * w for w in widths))
    for r in rows:
        print("  ".join(cell(r[c]).ljust(w) for c, w in zip(cols, widths)))
    print(f"({len(rows)} rows)")


def main():
    if len(sys.argv) < 2:
        print("usage: sqlite_query.py <db_path> [SQL]", file=sys.stderr)
        sys.exit(2)
    db = sys.argv[1]
    sql = sys.argv[2] if len(sys.argv) > 2 else sys.stdin.read()
    if not sql.strip():
        print("ERR: empty SQL", file=sys.stderr)
        sys.exit(2)

    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        for stmt in [s.strip() for s in sql.split(";") if s.strip()]:
            cur = con.execute(stmt)
            fmt_rows(cur)
    finally:
        con.close()


if __name__ == "__main__":
    main()
