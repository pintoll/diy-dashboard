import { createTodo, deleteTodo, updateTodo } from "./crud";
import { getTodosDb } from "./db";
import { withBufferedTodosChanged } from "./events";
import { createPlanEntry, deletePlanEntry, updatePlanEntry } from "./plan";
import { parseApply, type OpRef, type ParsedOp } from "./apply-ops";
import type {
  PlanEntry,
  PlanEntryCreateInput,
  PlanEntryPatch,
  Todo,
  TodoCreateInput,
  TodoPatch,
  WriteContext,
} from "./types";

// The assistant's one write path (POST /api/apply): one intent = one reason =
// one atomic batch of ops (docs/design/assistant-architecture.md). Each op
// runs through the same domain functions the single-op routes and IPC call —
// their per-op transactions become savepoints inside the outer transaction
// here, so a failure anywhere rolls back the whole intent, reason row
// included, and the buffered todos:changed pushes are dropped with it.

export type ApplyOpResult = { todo: Todo } | { entry: PlanEntry } | { deleted: string };

export type ApplyResult = {
  // Null when no op journaled anything (every op was a no-change patch): the
  // reason row is minted lazily by the first journaled op (journal.ts).
  reasonId: string | null;
  // One entry per op, in batch order.
  results: ApplyOpResult[];
};

export function applyBatch(body: unknown): ApplyResult {
  const { reason, sessionId, ops } = parseApply(body);
  const db = getTodosDb();
  // One shared context for the whole batch: every op lands on one reason row
  // and one `at` stamp, which is how the log renderer collapses the batch to
  // a single line (log-render.ts).
  const ctx: WriteContext = {
    source: "assistant",
    reason: { source: "assistant", sessionId, text: reason },
  };
  const results: ApplyOpResult[] = [];
  // Ids minted by create ops, by op index — the "$N" targets. Non-create
  // slots hold null; the parser guarantees refs only point at create ops.
  const created: (string | null)[] = [];

  withBufferedTodosChanged(() => {
    db.transaction(() => {
      for (const op of ops) {
        const result = runOp(op, created, ctx);
        results.push(result);
        created.push(createdId(op, result));
      }
    })();
  });

  return { reasonId: ctx.reasonId ?? null, results };
}

function resolveRef(ref: OpRef, created: (string | null)[]): string {
  if (ref.kind === "id") return ref.id;
  return created[ref.index] as string;
}

function createdId(op: ParsedOp, result: ApplyOpResult): string | null {
  if (op.kind === "todo.create") return (result as { todo: Todo }).todo.id;
  if (op.kind === "plan.create") return (result as { entry: PlanEntry }).entry.id;
  return null;
}

function runOp(
  op: ParsedOp,
  created: (string | null)[],
  ctx: WriteContext
): ApplyOpResult {
  switch (op.kind) {
    case "todo.create":
      return { todo: createTodo(op.input as TodoCreateInput, ctx) };
    case "todo.update":
      return {
        todo: updateTodo(resolveRef(op.ref, created), op.patch as TodoPatch, ctx),
      };
    case "todo.delete": {
      const id = resolveRef(op.ref, created);
      deleteTodo(id, ctx);
      return { deleted: id };
    }
    case "plan.create":
      return {
        entry: createPlanEntry(
          { ...op.input, todoId: resolveRef(op.todoRef, created) } as PlanEntryCreateInput,
          ctx
        ),
      };
    case "plan.update":
      return {
        entry: updatePlanEntry(
          resolveRef(op.ref, created),
          op.patch as PlanEntryPatch,
          ctx
        ),
      };
    case "plan.delete": {
      const id = resolveRef(op.ref, created);
      deletePlanEntry(id, ctx);
      return { deleted: id };
    }
  }
}
