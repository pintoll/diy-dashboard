import { getDb } from "./db";
import type { FeedbackActionType } from "./types";

const VALID_ACTIONS: readonly FeedbackActionType[] = [
  "like",
  "dislike",
  "unlike",
  "undislike",
  "click",
];

// Mirrors the "Feedback Daily News" workflow: validate articleId/action (the
// If node), then branch on action (the Switch node). like|dislike|click insert
// the row; unlike|undislike delete the matching row with the leading "un"
// stripped from the action.
export function recordFeedback(input: {
  articleId: number;
  action: FeedbackActionType;
}): void {
  const { articleId, action } = input;

  if (!Number.isFinite(articleId) || !VALID_ACTIONS.includes(action)) {
    return;
  }

  const db = getDb();

  if (action === "unlike" || action === "undislike") {
    db.prepare(
      "DELETE FROM feedback WHERE article_id = ? AND action = ?"
    ).run(articleId, action.slice(2));
    return;
  }

  db.prepare(
    "INSERT INTO feedback (article_id, action) VALUES (?, ?) ON CONFLICT(article_id, action) DO NOTHING"
  ).run(articleId, action);
}
