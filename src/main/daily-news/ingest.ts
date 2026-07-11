import Parser from "rss-parser";
import { getDb } from "./db";
import { RSS_SOURCES } from "./sources";
import { geminiGenerate } from "./gemini";
import { kstToday } from "./kst";
import { emitDailyNewsStatus } from "./status";
import { getGeminiApiKey } from "../settings/store";

// Faithful port of the "Score Articles" n8n workflow (Pipeline A).
// Flow: Fetch/Merge Profile -> RSS Read + Attach Meta -> Clean & Dedup ->
// Build Batch Prompt -> Gemini -> Parse & Score -> Filter Included ->
// Format Response -> Upsert articles.

const BATCH_SIZE = 15;
const MAX_PER_CATEGORY = 8;
const THRESHOLD = 4.5;
const W_REL = 0.7;
const W_IMP = 0.3;

const parser = new Parser();

type CleanedArticle = {
  title: string;
  link: string;
  description: string;
  category: string;
  source: string;
  pubDate: string;
};

type Batch = {
  prompt: string;
  articles: CleanedArticle[];
  batchIndex: number;
};

// Shape Gemini is asked to return, one per article in the batch.
type GeminiScore = {
  id: number;
  relevance: number;
  importance: number;
  summary?: string;
};

// Mutable scored row (serendipity mutates tag/include in place).
type ScoredResult = {
  title: string;
  link: string;
  description?: string;
  category?: string;
  source?: string;
  pubDate?: string;
  relevance: number;
  importance: number;
  finalScore: number;
  summary: string;
  tag: string;
  include: boolean;
};

// Row shape upserted into the articles table (mirrors "Format Response").
type FormattedRow = {
  title: string;
  summary: string;
  url: string;
  source: string | null;
  category: string;
  published_at: string;
  relevance: number | null;
  importance: number | null;
  final_score: number | null;
  tag: string;
  fetched_date: string;
};

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// "Fetch Profile" + "Merge Profile": read core / short_term content.
function loadProfile(): { coreProfile: string; shortTermProfile: string } {
  const rows = getDb()
    .prepare("SELECT profile_type, content FROM user_profile ORDER BY id")
    .all() as { profile_type: string; content: string }[];

  const profile: Record<string, string> = {};
  for (const row of rows) profile[row.profile_type] = row.content;

  return {
    coreProfile: profile.core || "",
    shortTermProfile: profile.short_term || "",
  };
}

// "RSS Read" + "Attach Meta": fetch each feed, attach category/source.
// A failing feed is skipped (warn + continue) so one bad source can't
// abort the whole run.
async function fetchAllItems(): Promise<Record<string, unknown>[]> {
  const collected: Record<string, unknown>[] = [];

  for (const src of RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(src.url);
      for (const item of feed.items) {
        collected.push({ ...item, category: src.category, source: src.source });
      }
    } catch (error) {
      console.warn(`[daily-news] RSS fetch failed for ${src.source}:`, error);
    }
  }

  return collected;
}

// "Clean & Debup": dedup by link, strip HTML, slice 0..300, require title+link.
function cleanAndDedup(items: Record<string, unknown>[]): CleanedArticle[] {
  const seen = new Set<string>();
  const cleaned: CleanedArticle[] = [];

  for (const d of items) {
    const title = str(d.title).trim();
    const link = (str(d.link) || str(d.url)).trim();
    const description = (
      str(d.description) ||
      str(d.content) ||
      str(d.contentSnippet)
    )
      .replace(/<[^>]*>/g, "")
      .trim();
    const category = str(d.category) || "General";
    const source = str(d.source) || "Unknown";
    const pubDate = str(d.pubDate) || str(d.isoDate);

    if (!link || seen.has(link)) continue;
    seen.add(link);
    if (!title) continue;

    cleaned.push({
      title,
      link,
      description: description.slice(0, 300),
      category,
      source,
      pubDate,
    });
  }

  return cleaned;
}

// "Build Batch Prompt": chunk into batches of 15 with the numbered line format.
function buildBatches(articles: CleanedArticle[]): Batch[] {
  const batches: Batch[] = [];

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const articleList = batch
      .map(
        (a, idx) =>
          `${idx + 1}. [${a.source}/${a.category}] ${a.title}\n   ${a.description}`
      )
      .join("\n\n");

    batches.push({
      prompt: articleList,
      articles: batch,
      batchIndex: Math.floor(i / BATCH_SIZE),
    });
  }

  return batches;
}

function buildSystemInstruction(
  coreProfile: string,
  shortTermProfile: string
): string {
  return (
    "You are a news curator. Evaluate each article based on the user's interest profile.\n\n" +
    "[Core Interests]: " +
    coreProfile +
    "\n[Short-term Interests]: " +
    shortTermProfile +
    "\n\nFor each article, return a JSON array:\n" +
    "- id: article number\n" +
    "- relevance: 0-10, relevance to user interests\n" +
    "- importance: 0-10, objective industry/social significance (security vulnerabilities, major releases, industry shifts, etc.)\n" +
    "- summary: one-line summary"
  );
}

// "Parse & Score" for a single batch's Gemini response.
function scoreBatch(batch: Batch, geminiText: string): ScoredResult[] {
  const results: ScoredResult[] = [];

  let scores: GeminiScore[];
  try {
    const parsed = JSON.parse(geminiText) as unknown;
    scores = Array.isArray(parsed)
      ? (parsed as GeminiScore[])
      : [parsed as GeminiScore];
  } catch {
    // Gemini returned unparseable JSON for this batch. Drop it rather than
    // fabricate scores: emitting score-5 rows (and, via the tag != "dropped"
    // filter downstream, forcing them into the feed) would pollute both the
    // feed and the weekly learning loop with articles that were never scored.
    // The batch simply does not appear today.
    console.warn(
      `[daily-news] batch ${batch.batchIndex}: score parse failed, dropping ${batch.articles.length} article(s)`
    );
    return results;
  }

  for (const score of scores) {
    const aIdx = score.id - 1;
    const article = batch.articles[aIdx];
    if (!article) continue;

    let tag = "dropped";
    let include = false;
    const finalScore = score.relevance * W_REL + score.importance * W_IMP;

    if (score.importance >= 9) {
      tag = "bypass";
      include = true;
    } else if (finalScore >= THRESHOLD) {
      tag = "relevant";
      include = true;
    }

    results.push({
      title: article.title,
      link: article.link,
      description: article.description,
      category: article.category,
      source: article.source,
      pubDate: article.pubDate,
      relevance: score.relevance,
      importance: score.importance,
      finalScore: Math.round(finalScore * 10) / 10,
      summary: score.summary ?? "",
      tag,
      include,
    });
  }

  return results;
}

// "Format Response": map to article rows, sort by score, cap per category.
function formatResponse(included: ScoredResult[], today: string): FormattedRow[] {
  const rows: FormattedRow[] = included.map((d) => ({
    title: d.title,
    summary: d.summary || "",
    url: d.link,
    source: d.source ?? null,
    category: (d.category || "tech").toLowerCase(),
    published_at: d.pubDate || new Date().toISOString(),
    relevance: d.relevance,
    importance: d.importance,
    final_score: d.finalScore,
    tag: d.tag,
    fetched_date: today,
  }));

  rows.sort((a, b) => (b.final_score || 0) - (a.final_score || 0));

  const counts: Record<string, number> = {};
  return rows.filter((row) => {
    counts[row.category] = (counts[row.category] || 0) + 1;
    return counts[row.category] <= MAX_PER_CATEGORY;
  });
}

const UPSERT_SQL = `
INSERT INTO articles
  (title, summary, url, source, category, published_at, relevance, importance, final_score, tag, fetched_date)
VALUES
  (@title, @summary, @url, @source, @category, @published_at, @relevance, @importance, @final_score, @tag, @fetched_date)
ON CONFLICT(url) DO UPDATE SET
  title = excluded.title,
  summary = excluded.summary,
  source = excluded.source,
  category = excluded.category,
  published_at = excluded.published_at,
  relevance = excluded.relevance,
  importance = excluded.importance,
  final_score = excluded.final_score,
  tag = excluded.tag,
  fetched_date = excluded.fetched_date
`;

export async function runIngest(): Promise<{ inserted: number }> {
  const apiKey = getGeminiApiKey();
  if (apiKey === undefined) throw new Error("NO_API_KEY");

  try {
    emitDailyNewsStatus({ phase: "fetching" });
    const { coreProfile, shortTermProfile } = loadProfile();
    const system = buildSystemInstruction(coreProfile, shortTermProfile);

    const rawItems = await fetchAllItems();
    const cleaned = cleanAndDedup(rawItems);
    const batches = buildBatches(cleaned);

    // Accumulate scored rows across all batches before applying serendipity once.
    const results: ScoredResult[] = [];
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      emitDailyNewsStatus({
        phase: "scoring",
        current: i + 1,
        total: batches.length,
      });
      const geminiText = await geminiGenerate({
        apiKey,
        system,
        user: batch.prompt,
        json: true,
        temperature: 0.2,
      });
      results.push(...scoreBatch(batch, geminiText));
    }

    // Serendipity: revive up to 2 dropped articles at random (mutates in place).
    const dropped = results.filter((r) => !r.include);
    const shuffled = dropped.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(2, shuffled.length); i++) {
      shuffled[i].tag = "serendipity";
      shuffled[i].include = true;
    }

    // "Filter Included": drop only the rows still tagged "dropped".
    const included = results.filter((r) => r.tag !== "dropped");
    const formatted = formatResponse(included, kstToday());

    emitDailyNewsStatus({ phase: "saving" });
    const db = getDb();
    const stmt = db.prepare(UPSERT_SQL);
    const upsertAll = db.transaction((rows: FormattedRow[]) => {
      let count = 0;
      for (const row of rows) count += stmt.run(row).changes;
      return count;
    });
    const inserted = upsertAll(formatted);

    emitDailyNewsStatus({ phase: "done", inserted });
    return { inserted };
  } catch (error) {
    emitDailyNewsStatus({
      phase: "error",
      message: error instanceof Error ? error.message : "Ingest failed",
    });
    throw error;
  }
}
