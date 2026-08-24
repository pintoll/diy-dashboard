# In-App Assistant: Behavior Contract

Behavior contract for the in-app "secretary" agent, fixed 2026-08-24. Results
only, deliberation intentionally omitted. Architecture and implementation are
not designed yet.

Status: **behavior defined, nothing implemented.**

## Identity

- A thought-organizing secretary, not a manager. The user owns execution; the
  assistant never enforces, nags, or scores.
- Reactive only. The user always opens the conversation (in-app chat surface).
  No proactive pings, no real-time interventions.
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
  the oversight, no per-operation approval step. Each applied change is a
  revertible diff anchored to its conversation point, so rewind works like
  Claude Code's: conversation only, state only, or both.

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

- PARA layer for long-term planning above days.
- Widening widget access beyond todos/pomodoro, with isolation.
