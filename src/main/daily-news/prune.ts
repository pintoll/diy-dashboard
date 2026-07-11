import { getDb } from "./db";
import { kstDateDaysAgo } from "./kst";

// The scheduler inserts a fresh batch of articles every day, so the table grows
// without bound. The feed is only an algorithmic-recommendation surface, so keep
// the ones the user liked (a durable preference signal) indefinitely and drop
// the rest once they age out.
const PRUNE_AFTER_DAYS = 90;

/**
 * Delete never-liked articles older than PRUNE_AFTER_DAYS (by KST fetched_date).
 * Liked articles are kept indefinitely, feedback and all.
 *
 * feedback.article_id is a RESTRICT foreign key (the DB runs with
 * `foreign_keys = ON`), so a prunable article's non-like feedback rows
 * (dislike / click) must be removed before the article row or the delete would
 * throw. Liked articles are excluded from the id set entirely, so their feedback
 * is never touched. interest_signals is deliberately not pruned here — the
 * aggregated learning state it holds outlives the raw articles that fed it.
 *
 * Returns the number of articles removed. Runs in a single transaction.
 */
export function pruneOldArticles(): number {
  const db = getDb();
  const cutoff = kstDateDaysAgo(PRUNE_AFTER_DAYS);

  const ids = db
    .prepare(
      `SELECT a.id FROM articles a
       WHERE a.fetched_date < ?
         AND NOT EXISTS (
           SELECT 1 FROM feedback f
           WHERE f.article_id = a.id AND f.action = 'like'
         )`
    )
    .all(cutoff) as { id: number }[];

  if (ids.length === 0) return 0;

  const removeAll = db.transaction((rows: { id: number }[]) => {
    const removeFeedback = db.prepare("DELETE FROM feedback WHERE article_id = ?");
    const removeArticle = db.prepare("DELETE FROM articles WHERE id = ?");
    for (const { id } of rows) {
      removeFeedback.run(id);
      removeArticle.run(id);
    }
    return rows.length;
  });

  return removeAll(ids);
}
