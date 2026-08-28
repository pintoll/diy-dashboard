# Assistant: Behavior Contract

Behavior contract for the "secretary" agent, fixed 2026-08-24; amended
2026-08-26 for the Claude Code pivot (the chat surface and the rewind clause —
see `assistant-architecture.md`, "The brain"). Results only, deliberation
intentionally omitted.

Status: **behavior defined; implementation tracked in
`assistant-architecture.md`.**

## Identity

- A thought-organizing secretary, not a manager. The user owns execution; the
  assistant never enforces, nags, or scores.
- Reactive only. The user always opens the conversation (a Claude Code
  session in the secretary workspace). No proactive pings, no real-time
  interventions.
- Retrospection is material for the next plan, not judgment.

## Core principle

**Facts from widgets, meaning from conversation.** The assistant reads
everything the app already records (todos, done states, pomodoro sessions) so
the user never re-enters known facts, but uses that data only inside a
conversation the user started. Gaps are filled by asking, not by inference.
Observation exists to remove repeated input, not to monitor.

## Day model

- A day runs 05:00 to 05:00 the next calendar day.
- Each day has a record with three parts:
  1. **Plan**: todos penciled onto variable clock-time ranges
     (e.g. "10:00-14:00 X"). Ranges are free-form per day; a late start just
     means the plan starts late. No fixed slots, no pomodoro estimates.
  2. **Log**: append-only, time-ordered, natural-language entries for every
     plan/todo change.
  3. **Result**: the folded snapshot of the day (log applied onto plan) plus
     remarks.
- Plans are pencil sketches and are expected to break. Roughly 80% adherence
  to the initial plan is a good day; re-planning is the normal path, not a
  failure state.
- Shrinking a task means splitting the todo (C into C-1, C-2) with ordinary
  add/edit/delete. Lineage lives only in the log; todos stay flat, no
  parent/child structure.

## Sessions

- Sessions are disposable. Memory lives in day records, not chat history.
- Every session loads the same distilled context before speaking: yesterday's
  result, today's plan, today's log so far. This triple is what goes to the
  model; models stay swappable behind an adapter.
- If today has no plan yet, the session becomes the planning session.
- Changes apply immediately during conversation; the conversation itself is
  the oversight, no per-operation approval step. Each applied intent is one
  journaled reason with full before/after snapshots.
- Reverting is explicit, not a rewind: on request, the assistant issues
  compensating ops under a "revert: ..." reason — a journaled change like any
  other. Conversation-side rewind belongs to the host (Claude Code) and is
  not coupled to state; there is no atomic conversation+state rewind.
  (Amended 2026-08-26; the original clause promised Claude-Code-style
  conversation/state/both rewind, which the pivot made moot.)

## Log rules

- Auto-written, never a user chore. Direct UI edits produce mechanical
  entries; assistant-made changes carry a one-line reason taken from the
  conversation.
- Natural language, model-agnostic; precision is not required. Entries without
  reasons get inferred later, or asked about.
- Kept after folding. Default session context is the snapshot; the log is
  drill-down (e.g. "three re-plans yesterday, plan lighter today").

## Folding (closing a day)

- Two equally valid paths, chosen in the moment: fold at night in a closing
  chat, or lazily the next morning, where the "how was yesterday" conversation
  folds it and remarks are drawn from the user's answers.
- Gap days are common and expected. A morning session folds back to the last
  unfolded day; days with no plan and no activity stay empty. "Yesterday"
  means the last day with records, not the calendar yesterday.

## Deferred (see backlog.md)

- Widening widget access beyond todos/pomodoro, with isolation.

The PARA layer for long-term planning above days is no longer deferred: it
shipped as projects and areas with their own backlogs and docs
(`projects-para.md`). It leaves this contract intact — projects never execute,
so the day model above is unchanged — and adds three rituals the assistant
assists with: the morning pull of a next action onto today, the evening
per-project worklog append after a fold, and the weekly review sweep (empty the
inbox, judge the stale, promote from someday).
