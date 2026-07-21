# Todo Backlog ("창고")

A bucket for work that is real but has no planned day. A todo with **no date**
is in the backlog: it appears in no day list, never turns up as Overdue, and
moves in and out freely without losing its id, `workedSec`, or its
`todo_sessions` ledger rows.

Status: **implemented.** Branch `feature/todo-backlog`.

## Why

`todos.date` was `NOT NULL`, so the only way to record "해야 하는데 기약이 없다"
was to pick a day. Both outcomes are wrong:

- A **future** date makes the item surface on a morning you will not do it, and
  the ritual of pushing it forward one more day repeats forever.
- A **past** date parks it in `listOverdue` permanently.

The second is the real damage. Overdue is styled as debt — a destructive-red
count at the top of today — and it earns that urgency by being short and true.
Once it doubles as a warehouse, the signal dies: a list containing both "the PR
review you skipped yesterday" and "write the first post for a blog you have not
built yet" teaches you to ignore all of it.

Debt and inventory are different things and belong in different lists.

## Data model: a null date

`date IS NULL` is the backlog. Two alternatives were considered and rejected:

- **A separate `backlog` table.** Moving in and out would become create+delete,
  which changes the id and destroys the accrued `workedSec` and every
  `todo_sessions` row pointing at it. Free movement between the buckets is the
  entire feature, so this trades away the point.
- **A `bucket` column** (`'day' | 'backlog'`), keeping `date` non-null. Every
  existing date query would then need a hand-written `AND bucket = 'day'`, and
  forgetting it in one place leaks parked items back into Overdue — the exact
  failure this feature exists to prevent, reintroduced as a silent one.

NULL is enforced by SQL semantics rather than by convention. Every existing
query excludes it for free, with no change and no new predicate:

| query | site | effect on a null-dated row |
|---|---|---|
| `WHERE date = ?` | `crud.ts` `listTodos` | never matches — invisible in day lists |
| `WHERE date BETWEEN ? AND ?` | `crud.ts` `listTodos` | never matches — invisible in the week strip |
| `WHERE done = 0 AND date < ?` | `crud.ts` `listOverdue` | never matches — **never overdue** |

A sentinel string (`date = 'backlog'`) would also sort clear of every real date,
but it keeps the type `string`, so a missed call site renders "Invalid Date"
silently instead of failing the build. Null gets the compiler's help; there were
only three renderer readers of `todo.date` to fix.

## The un-park rule

Anything that means *work is happening* assigns a real day:

- **Added to the desk** → `date = kstToday()` (`todos/desk.ts`)
- **Marked done** → `date = kstToday()` (`todos/crud.ts` `updateTodo`)

An explicit `date` in the same patch always wins, so a caller can still park a
completed todo deliberately.

Without this, a desk member with no date would accrue `workedSec` while
appearing in neither today's list, the today widget, nor `dyd`'s overview — time
banked into a bucket nobody looks at. The rule also keeps the invariant that
finished work always belongs to some day, which is what the analytics page
assumes.

A todo that changes bucket also gets `sort_order` reassigned to the end of its
destination (unless the patch sets `sortOrder` explicitly). Carrying the old
number over would drop a pulled item into the middle of the destination list.

## Migration

`schema.ts` migration 3 relaxes `date` to nullable. SQLite cannot change a
column constraint in place, so the table is rebuilt — and unlike the earlier
`todo_sessions` rebuild, `todos` is a **parent**: both `todo_sessions` and
`desk` reference it `ON DELETE CASCADE`, and `db.ts` enables `foreign_keys`
before migrating. A plain `DROP TABLE todos` would therefore cascade the entire
worked-time ledger into oblivion. The migration turns foreign keys off around
the rebuild (outside the transaction, since SQLite ignores the pragma inside
one) and runs `foreign_key_check` before committing.

This cannot be unit-tested: `better-sqlite3` is rebuilt against Electron's ABI
by `postinstall`, so importing it from the node-env vitest suite fails with
`ERR_DLOPEN_FAILED`. Verify by backing up `todos.db`, launching the app, and
confirming the analytics day drill-down still resolves per-session todo titles.

## Surfaces

**UI** (`pages/todos/ui/BacklogSection.tsx`) — a collapsed-by-default section
below the day list on `/todos`, shown on every date. The header carries the
count, deliberately: a warehouse with no visible size becomes a black hole.
Rows are drag-orderable like a day (`SortableTodoList` takes `date: null`), and
`AddTodoForm date={null}` writes straight into it.

The two directions are asymmetric on purpose:

- **Day → backlog** is a considered move, so it lives in the edit dialog: a
  `No date (backlog)` checkbox, plus a `Move to backlog` button that is the
  one-click form of checking it and saving.
- **Backlog → day** is the move you want to be frictionless, so it is a single
  always-visible button on the row. It targets the **browsed** date, not
  hard-coded today, so the section works the same on any day.

**Agent API** — `GET /api/todos/backlog`, and `"date": null` on POST/PATCH.
Null on the wire, never a magic string. Omitting `date` on create still means
today; only an explicit null parks.

**`dyd`** — `dyd todo backlog` lists it, `-d backlog` creates into it, and
`dyd todo move <n|id|b<n>> <backlog|today|tomorrow|YYYY-MM-DD>` moves between
buckets. `move` is one verb for park, pull, and reschedule, which also fills a
gap: `dyd` previously could not re-plan a todo at all. Backlog positions are
addressed as `b1`, `b2` to keep them distinct from today's `1`, `2`.

## Deliberately not built

**No resurfacing.** Nothing periodically pulls backlog items back into view.
A warehouse that taps you on the shoulder is just Overdue with extra steps; the
header count is the only nudge.
