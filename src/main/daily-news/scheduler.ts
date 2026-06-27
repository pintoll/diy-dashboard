import { getDb } from "./db";
import { runIngest } from "./ingest";
import { runWeeklyProfileUpdate } from "./profile";
import { hasTodayArticles } from "./serve";
import { kstHour } from "./kst";

const TICK_INTERVAL_MS = 30 * 60 * 1000;
const WEEKLY_PROFILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Run-guards: a manual fetch IPC and the scheduled tick can fire at once;
// these ensure ingest / weekly-profile never run concurrently with themselves.
let ingestRunning = false;
let weeklyRunning = false;

/**
 * True when the weekly loop has never run or last ran >= 7 days ago.
 * runWeeklyProfileUpdate stamps user_profile.short_term.updated_at before its
 * destructive decay on every keyed run, so this gate throttles all weekly work
 * (decay, Gemini calls, synthesis) to a weekly cadence regardless of outcome.
 */
function isWeeklyProfileStale(): boolean {
  const row = getDb()
    .prepare(
      "SELECT updated_at FROM user_profile WHERE profile_type = 'short_term'"
    )
    .get() as { updated_at: string | null } | undefined;

  if (!row || !row.updated_at) return true;

  // SQLite datetime('now') yields UTC "yyyy-MM-dd HH:mm:ss" with no offset, which
  // Date.parse would otherwise read as local time; pin it to UTC with a "Z".
  const updatedMs = Date.parse(row.updated_at.replace(" ", "T") + "Z");
  if (Number.isNaN(updatedMs)) return true;

  return Date.now() - updatedMs >= WEEKLY_PROFILE_MAX_AGE_MS;
}

/**
 * Idempotent daily refresh: run the ingest pipeline only when today's (KST)
 * articles are missing. No hour gate -- the fetch IPC uses this directly.
 * Errors propagate (the caller decides how to surface them).
 */
export async function ensureDailyNewsForToday(): Promise<void> {
  if (ingestRunning) return;
  if (hasTodayArticles()) return;

  ingestRunning = true;
  try {
    await runIngest();
  } finally {
    ingestRunning = false;
  }
}

/**
 * Run the weekly learning loop when the short_term profile is stale.
 * Idempotent and run-guarded. Errors propagate.
 */
export async function ensureWeeklyProfile(): Promise<void> {
  if (weeklyRunning) return;
  if (!isWeeklyProfileStale()) return;

  weeklyRunning = true;
  try {
    await runWeeklyProfileUpdate();
  } finally {
    weeklyRunning = false;
  }
}

/** One scheduler pass; failures are logged and never bubble out of the tick. */
async function tick(): Promise<void> {
  if (kstHour() >= 5) {
    try {
      await ensureDailyNewsForToday();
    } catch (error) {
      console.error("[daily-news] daily ingest failed:", error);
    }
  }

  try {
    await ensureWeeklyProfile();
  } catch (error) {
    console.error("[daily-news] weekly profile update failed:", error);
  }
}

/** Run a tick immediately, then poll every ~30 minutes while the app is alive. */
export function startDailyNewsScheduler(): void {
  void tick();
  setInterval(() => void tick(), TICK_INTERVAL_MS);
}
