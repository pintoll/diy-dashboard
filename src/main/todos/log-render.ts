import { clockHm } from "@shared/day";
import { changedKeys, type OpEntity, type OpKind } from "./journal";
import type { PlanEntryRow, TodoRow, TodoSource } from "./types";

// Renders the ops journal to natural-language log lines — the day record's
// third part, derived at read time (docs/design/assistant-architecture.md):
// consecutive ops sharing one reason collapse into a single line; unreasoned
// (direct UI) ops render mechanically, one line per op, except a todo delete's
// plan-entry sweep, which folds into the delete's own line. Pure rows-in/
// lines-out so the grammar and grouping are unit-testable; log.ts owns the
// queries and title resolution.

export type LogOp = {
  seq: number;
  entity: OpEntity;
  entityId: string;
  op: OpKind;
  /** Parsed snapshots (log.ts parses the stored JSON). */
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  source: TodoSource;
  reasonId: string | null;
  reasonText: string | null;
  /** ISO-8601 UTC (journal.ts). */
  at: string;
};

export type LogLine = {
  /** First op of the group — the future rewind anchor: state before this line. */
  seq: number;
  at: string;
  /** Wall-clock "HH:MM" in the app's zone, for display. */
  time: string;
  source: TodoSource;
  /** Self-contained sentence; on reasoned lines it embeds `reason`. */
  text: string;
  reason?: string;
};

export type RenderLogInput = {
  /** The queried day — matching dates are elided from the sentences. */
  day: string;
  /** Ascending seq. */
  ops: LogOp[];
  /** Plan-op title resolution (plan snapshots carry no title). */
  titlesByTodoId: Map<string, string>;
};

type TodoSnap = Partial<TodoRow>;
type PlanSnap = Partial<PlanEntryRow>;

export function renderLogLines(input: RenderLogInput): LogLine[] {
  const lines: LogLine[] = [];
  for (const segment of segmentOps(input.ops)) {
    const units = collapseSweeps(segment.ops);
    const render = (unit: Unit): string =>
      renderUnit(unit, input.day, input.titlesByTodoId);
    if (segment.reasoned) {
      const first = segment.ops[0];
      const reason = first.reasonText as string;
      lines.push({
        ...anchor(first),
        reason,
        text: `${reason}: ${units.map(render).join(", ")}`,
      });
    } else {
      for (const unit of units) {
        lines.push({ ...anchor(unit.ops[0]), text: render(unit) });
      }
    }
  }
  return lines;
}

/** Todo ids referenced by plan-op snapshots — what log.ts resolves to titles. */
export function referencedTodoIds(ops: LogOp[]): Set<string> {
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.entity !== "plan") continue;
    const todoId = ((op.after ?? op.before) as PlanSnap | null)?.todo_id;
    if (typeof todoId === "string") ids.add(todoId);
  }
  return ids;
}

function anchor(op: LogOp): Pick<LogLine, "seq" | "at" | "time" | "source"> {
  return { seq: op.seq, at: op.at, time: clockHm(Date.parse(op.at)), source: op.source };
}

type Segment = { reasoned: boolean; ops: LogOp[] };

// Maximal consecutive runs: same non-null reason id, or unreasoned ops of one
// source. Splitting only on change keeps time order intact; a reason id that
// reappears after a gap honestly becomes a second line (cannot happen within
// one transaction). A reasoned op whose reason row is unresolvable (no FK on
// ops) degrades to mechanical rendering rather than a blank reason.
function segmentOps(ops: LogOp[]): Segment[] {
  const segments: Segment[] = [];
  let key: string | null = null;
  for (const op of ops) {
    const reasoned = op.reasonId !== null && op.reasonText !== null;
    const opKey = reasoned ? `r:${op.reasonId}` : `m:${op.source}`;
    if (opKey !== key) {
      key = opKey;
      segments.push({ reasoned, ops: [] });
    }
    segments[segments.length - 1].ops.push(op);
  }
  return segments;
}

// One rendered fragment: a single op, or a todo delete fused with the
// plan-delete sweep that preceded it in the same transaction (crud.ts sweeps
// entries via the journal right before the todo row goes). "Same transaction"
// is decided by an equal `at` stamp — journal.ts reads the clock once per
// WriteContext, so one intent's ops share one stamp while separate intents,
// however adjacent in the journal, do not. Adjacency alone would fuse an
// unplan and a deletion hours apart into a fictitious sweep line anchored at
// the earlier time.
type Unit = { ops: LogOp[]; sweptBlocks: number };

function collapseSweeps(ops: LogOp[]): Unit[] {
  const units: Unit[] = [];
  // Contiguous plan deletes of one todo, waiting for that todo's delete op.
  let pending: LogOp[] = [];
  const flush = (): void => {
    for (const op of pending) units.push({ ops: [op], sweptBlocks: 0 });
    pending = [];
  };
  const pendingTodoId = (): unknown => (pending[0].before as PlanSnap).todo_id;
  const joinsPending = (todoId: unknown, at: string): boolean =>
    pending.length > 0 && pendingTodoId() === todoId && pending[0].at === at;

  for (const op of ops) {
    if (op.entity === "plan" && op.op === "delete") {
      const todoId = (op.before as PlanSnap | null)?.todo_id;
      if (pending.length > 0 && !joinsPending(todoId, op.at)) flush();
      pending.push(op);
      continue;
    }
    if (op.entity === "todo" && op.op === "delete" && joinsPending(op.entityId, op.at)) {
      units.push({ ops: [...pending, op], sweptBlocks: pending.length });
      pending = [];
      continue;
    }
    flush();
    units.push({ ops: [op], sweptBlocks: 0 });
  }
  flush();
  return units;
}

function renderUnit(unit: Unit, day: string, titles: Map<string, string>): string {
  // For a sweep the last op is the todo delete; the swept entries only feed
  // the parenthetical count.
  const op = unit.ops[unit.ops.length - 1];
  return op.entity === "todo"
    ? renderTodoOp(op, day, unit.sweptBlocks)
    : renderPlanOp(op, day, titles);
}

function renderTodoOp(op: LogOp, day: string, sweptBlocks: number): string {
  const before = (op.before ?? {}) as TodoSnap;
  const after = (op.after ?? {}) as TodoSnap;
  if (op.op === "create") {
    return `added "${after.title}"${createdDestination(after.date, day)}`;
  }
  if (op.op === "delete") {
    const swept =
      sweptBlocks === 0
        ? ""
        : ` (${sweptBlocks} planned block${sweptBlocks === 1 ? "" : "s"} removed)`;
    return `deleted "${before.title}"${swept}`;
  }
  return renderTodoUpdate(before, after);
}

function createdDestination(date: string | null | undefined, day: string): string {
  if (date === null) return " to the backlog";
  if (date === undefined || date === day) return "";
  return ` for ${date}`;
}

// Derived and cosmetic todo columns that never render: completed_on rides the
// done flip, sort_order is mechanical, worked_sec even accrues outside the
// journal (echoing it would misstate the diff), created_at cannot change.
// Everything else that journal.ts's generic diff reports either has bespoke
// grammar below or falls through to a generic "changed <field>" fragment — so
// a future todo column degrades loudly in the log instead of vanishing into
// the bare "updated" fallback.
const SILENT_TODO_FIELDS = new Set(["completed_on", "sort_order", "worked_sec", "created_at"]);
const SPOKEN_TODO_FIELDS = new Set(["title", "date", "done", "note"]);

// Changed fields only, in fixed order, comma-joined; the title is quoted once
// and then referred to as "it".
function renderTodoUpdate(before: TodoSnap, after: TodoSnap): string {
  const title = after.title ?? before.title;
  let named = false;
  const subject = (): string => {
    if (named) return "it";
    named = true;
    return `"${title}"`;
  };
  const place = (date: string | null | undefined): string => date ?? "the backlog";

  const fragments: string[] = [];
  if (before.title !== after.title) {
    named = true;
    fragments.push(`renamed "${before.title}" to "${after.title}"`);
  }
  if (before.date !== after.date) {
    fragments.push(`moved ${subject()} from ${place(before.date)} to ${place(after.date)}`);
  }
  if (before.done !== after.done) {
    fragments.push(after.done === 1 ? `completed ${subject()}` : `reopened ${subject()}`);
  }
  if (before.note !== after.note) {
    fragments.push(
      after.note === null
        ? `cleared the note on ${subject()}`
        : `updated the note on ${subject()}`
    );
  }
  for (const key of changedKeys(before, after).sort()) {
    if (SPOKEN_TODO_FIELDS.has(key) || SILENT_TODO_FIELDS.has(key)) continue;
    fragments.push(`changed ${key} of ${subject()}`);
  }
  return fragments.length === 0 ? `updated "${title}"` : fragments.join(", ");
}

const planRange = (s: PlanSnap): string => `${s.start}-${s.end}`;

function renderPlanOp(op: LogOp, day: string, titles: Map<string, string>): string {
  const before = (op.before ?? {}) as PlanSnap;
  const after = (op.after ?? {}) as PlanSnap;
  const snap = op.after === null ? before : after;
  const title =
    snap.todo_id !== undefined && titles.has(snap.todo_id)
      ? `"${titles.get(snap.todo_id)}"`
      : "(unknown todo)";
  // Plan ops land in the log of the day they HAPPENED (the at-window), which
  // may not be the day they schedule — name that day when it differs.
  const on = snap.day !== undefined && snap.day !== day ? ` on ${snap.day}` : "";
  if (op.op === "create") return `planned ${title} ${planRange(after)}${on}`;
  if (op.op === "delete") return `unplanned ${title} ${planRange(before)}${on}`;
  return renderPlanUpdate(before, after, title, on);
}

// Like renderTodoUpdate, driven by which snapshot fields actually differ — not
// by PlanEntryPatch's current retime-only surface. types.ts documents day
// moves and re-points as delete+create today, but that is prose: should the
// patch surface ever widen, the journal records the op faithfully and this
// must not compress it into a zero-width "retimed".
function renderPlanUpdate(
  before: PlanSnap,
  after: PlanSnap,
  title: string,
  on: string
): string {
  let named = false;
  const subject = (): string => {
    if (named) return "it";
    named = true;
    return title;
  };

  const fragments: string[] = [];
  if (before.start !== after.start || before.end !== after.end) {
    fragments.push(`retimed ${subject()} from ${planRange(before)} to ${planRange(after)}`);
  }
  const dayMoved = before.day !== after.day;
  if (dayMoved) {
    fragments.push(`moved ${subject()} from ${before.day} to ${after.day}`);
  }
  for (const key of changedKeys(before, after).sort()) {
    if (key === "start" || key === "end" || key === "day") continue;
    fragments.push(`changed ${key} of ${subject()}`);
  }
  if (fragments.length === 0) return `updated the plan for ${title}${on}`;
  // A day move names both days itself; the `on` suffix would name only one.
  return fragments.join(", ") + (dayMoved ? "" : on);
}
