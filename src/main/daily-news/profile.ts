import { getDb } from "./db";
import { geminiGenerate } from "./gemini";
import { kstToday } from "./kst";
import { getGeminiApiKey } from "../settings/store";

// Pipeline C -- faithful port of the "Weekly Profile Update" n8n workflow:
// decay signals -> learn from the week's feedback -> upsert interest signals ->
// synthesize the short-term profile from the stable signals.

type FeedbackRow = { title: string; category: string | null; action: string };
type ExtractedTopic = { topic: string; category?: string | null; direction?: string };
type StableSignalRow = {
  topic: string;
  category: string | null;
  score: number;
  hit_count: number;
};

export async function runWeeklyProfileUpdate(): Promise<{
  skipped?: string;
  updated?: boolean;
}> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { skipped: "no-key" };

  const db = getDb();

  // "Decay All Signals" -- fade every interest ~10% per weekly run so topics
  // that stop being reinforced eventually fall below the stability threshold.
  // Deliberately NOT run up front: applying decay on a run whose Gemini call
  // then fails (expired key, outage) bleeds the signals down with no learning
  // to replace them, and repeated failures erase the profile entirely. So decay
  // fires only where no learning is being skipped -- the no-feedback exit below
  // (nothing to learn this week) and after a successful topic extraction
  // (learning is about to be applied).
  const decayAllSignals = (): void => {
    db.prepare("UPDATE interest_signals SET score = score * 0.9").run();
  };

  // Stamp this weekly run before any mutation or Gemini call so the scheduler's
  // 7-day staleness gate (isWeeklyProfileStale) throttles EVERY outcome from
  // here on -- the no-feedback / no-stable early exits, a JSON.parse failure, or
  // a full synthesis -- to a weekly cadence. The original n8n workflow relied on
  // a weekly cron for this throttle; without stamping here the Gemini calls
  // below would re-fire on every ~30-min scheduler tick whenever the synthesis
  // path does not complete. (The no-key path above is intentionally left
  // unstamped so the loop activates on the next tick once a key is added,
  // instead of waiting out another 7-day window.)
  db.prepare(
    "UPDATE user_profile SET updated_at = datetime('now') WHERE profile_type = 'short_term'"
  ).run();

  // "Fetch Weekly Feedback"
  const feedback = db
    .prepare(
      `SELECT a.title, a.category, f.action
       FROM feedback f
       JOIN articles a ON f.article_id = a.id
       WHERE f.created_at > datetime('now', '-7 days')
         AND a.tag != 'bypass'
       ORDER BY f.created_at DESC`
    )
    .all() as FeedbackRow[];
  // No feedback this week: there is no Gemini call to fail, so decaying here is
  // safe and preserves the original weekly fade for quiet weeks.
  if (feedback.length === 0) {
    decayAllSignals();
    return { skipped: "no-feedback" };
  }

  // "Build Extraction Prompt"
  const liked = feedback
    .filter((i) => i.action === "like")
    .map((i) => `- "${i.title}" (${i.category})`);
  const disliked = feedback
    .filter((i) => i.action === "dislike")
    .map((i) => `- "${i.title}" (${i.category})`);

  let extractionPrompt = "Given these articles the user interacted with this week:\n\n";
  if (liked.length) extractionPrompt += "Liked:\n" + liked.join("\n") + "\n\n";
  if (disliked.length) extractionPrompt += "Disliked:\n" + disliked.join("\n") + "\n\n";
  extractionPrompt += `Extract the key topic keywords from each article.
Return a JSON array:
[
  { "topic": "rust-lang", "category": "tech", "direction": "like" }
]

Rules:
- Use lowercase kebab-case for topic names
- Be specific but not too granular (e.g., "rust-lang" not "rust-async-runtime")
- One topic per article, pick the most representative keyword
- direction must match the user's feedback action`;

  // "Gemini Extract Topics"
  const extractionText = await geminiGenerate({
    apiKey,
    user: extractionPrompt,
    json: true,
    temperature: 0.2,
  });

  // "Parse Topics" -- strip code fences, score by direction.
  const cleaned = (extractionText || "[]")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const signals = (JSON.parse(cleaned) as ExtractedTopic[]).map((s) => ({
    topic: s.topic,
    category: s.category || null,
    score: s.direction === "like" ? 1.0 : -1.0,
  }));

  // Extraction succeeded (the parse above did not throw), so this week's
  // learning is about to land: decay the existing signals, then fold in the new
  // ones below. A failed extraction never reaches this point, which is exactly
  // what keeps a broken run from eroding the profile.
  decayAllSignals();

  // "Upsert Signals"
  const today = kstToday();
  const upsert = db.prepare(
    `INSERT INTO interest_signals (topic, category, score, hit_count, last_seen)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(topic) DO UPDATE SET
       score = interest_signals.score + excluded.score,
       hit_count = interest_signals.hit_count + 1,
       category = COALESCE(excluded.category, interest_signals.category),
       last_seen = ?`
  );
  for (const s of signals) {
    upsert.run(s.topic, s.category, s.score, today, today);
  }

  // "Fetch Stable Signals"
  const stable = db
    .prepare(
      `SELECT topic, category, score, hit_count FROM interest_signals
       WHERE score >= 2.0 AND hit_count >= 2
       ORDER BY score DESC`
    )
    .all() as StableSignalRow[];
  if (stable.length === 0) return { skipped: "no-stable" };

  // "Fetch Current Profile"
  const current = db
    .prepare("SELECT content FROM user_profile WHERE profile_type = 'short_term'")
    .get() as { content: string } | undefined;
  const currentProfile = current?.content || "No current profile.";

  // "Build Synthesis Prompt"
  const signalLines = stable
    .map(
      (s) =>
        `- ${s.topic} (${s.category}): score ${s.score}, seen ${s.hit_count} times`
    )
    .join("\n");
  const synthesisPrompt = `These are the user's confirmed interest signals that passed the stability threshold
(score >= 2.0, seen at least twice):

${signalLines}

Current short-term interests:
"${currentProfile}"

Rewrite the short-term interests incorporating these stable signals.
Rules:
- Only reflect topics present in the signal data above
- Remove topics no longer in the signal list
- Keep the tone concise (2-3 sentences)
- Do NOT invent interests that aren't backed by signals`;

  // "Gemini Synthesize Profile" (plain text, no JSON mime)
  const synthesisText = await geminiGenerate({
    apiKey,
    user: synthesisPrompt,
    temperature: 0.3,
  });

  // "Parse Profile" + "Update Short-term Profile"
  const newProfile = synthesisText.trim();
  db.prepare(
    "UPDATE user_profile SET content = ?, updated_at = datetime('now') WHERE profile_type = 'short_term'"
  ).run(newProfile);

  return { updated: true };
}
