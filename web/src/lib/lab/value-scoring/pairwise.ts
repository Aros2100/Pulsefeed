// Pairwise helpers for the Craft value-scoring module.
// Pure DB operations — called from server-side route handlers.

import { INITIAL_REASON_CATEGORIES, PAIRS_PER_ARTICLE } from "./craft-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generate balanced round-robin pairs for the module.
 *
 * Each call adds `additionalPairs` pairs on top of whatever already exists,
 * keeping per-article pair counts balanced. The first call from sample accept
 * passes additionalPairs = 500 → every article appears in exactly 10 pairs.
 *
 * Subsequent calls add another batch (e.g. 500 more), bringing each article
 * to 20 pairs, balanced.
 */
export async function generateInitialPairs(
  db: Db,
  moduleId: string,
  additionalPairs: number,
): Promise<{ inserted: number }> {
  // 1. Article ids
  const { data: articles } = await db
    .from("lab_value_articles")
    .select("id")
    .eq("module_id", moduleId);

  const ids = (articles ?? []).map((r: { id: string }) => r.id) as string[];
  if (ids.length < 2) return { inserted: 0 };

  // 2. Existing pairs and per-article counts
  const { data: existing } = await db
    .from("lab_value_pairs")
    .select("article_a_id, article_b_id")
    .eq("module_id", moduleId);

  const existingSet = new Set<string>();
  const counts = new Map<string, number>(ids.map((id) => [id, 0]));

  type ExistingRow = { article_a_id: string; article_b_id: string };
  for (const row of (existing ?? []) as ExistingRow[]) {
    const key = pairKey(row.article_a_id, row.article_b_id);
    existingSet.add(key);
    counts.set(row.article_a_id, (counts.get(row.article_a_id) ?? 0) + 1);
    counts.set(row.article_b_id, (counts.get(row.article_b_id) ?? 0) + 1);
  }

  // 3. Target pair count per article after this batch
  const newTotalPairs = (existing?.length ?? 0) + additionalPairs;
  const targetPerArticle = Math.floor((newTotalPairs * 2) / ids.length);

  // 4. Build all candidate pairs not yet used, shuffled
  const candidates: { a: string; b: string }[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = pairKey(ids[i], ids[j]);
      if (!existingSet.has(key)) candidates.push({ a: ids[i], b: ids[j] });
    }
  }
  const shuffled = shuffle(candidates);

  // 5. Greedy round-robin: pick pairs while neither side has reached its target
  const picked: { a: string; b: string }[] = [];
  for (const cand of shuffled) {
    if (picked.length >= additionalPairs) break;
    const ca = counts.get(cand.a) ?? 0;
    const cb = counts.get(cand.b) ?? 0;
    if (ca >= targetPerArticle || cb >= targetPerArticle) continue;
    picked.push(cand);
    counts.set(cand.a, ca + 1);
    counts.set(cand.b, cb + 1);
  }

  // 6. Top-up pass: if greedy left us short (rare), relax the per-article cap
  if (picked.length < additionalPairs) {
    const cap = targetPerArticle + 1;
    for (const cand of shuffled) {
      if (picked.length >= additionalPairs) break;
      if (picked.includes(cand)) continue;
      const ca = counts.get(cand.a) ?? 0;
      const cb = counts.get(cand.b) ?? 0;
      if (ca >= cap || cb >= cap) continue;
      picked.push(cand);
      counts.set(cand.a, ca + 1);
      counts.set(cand.b, cb + 1);
    }
  }

  if (picked.length === 0) return { inserted: 0 };

  // 7. Insert (winner_id and session_id default to NULL)
  const rows = picked.map((p) => ({
    module_id: moduleId,
    article_a_id: p.a,
    article_b_id: p.b,
  }));

  // Insert in chunks to stay below PostgREST limits
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await db.from("lab_value_pairs").insert(chunk);
    if (error) throw new Error(`Failed to insert pairs: ${error.message}`);
  }

  return { inserted: picked.length };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Insert the six default reason categories for the module.
 * Idempotent: skipped if any category already exists for the module.
 */
export async function seedReasonCategories(db: Db, moduleId: string): Promise<{ inserted: number }> {
  const { count } = await db
    .from("lab_value_reason_categories")
    .select("id", { count: "exact", head: true })
    .eq("module_id", moduleId);

  if ((count ?? 0) > 0) return { inserted: 0 };

  const rows = INITIAL_REASON_CATEGORIES.map((label) => ({
    module_id: moduleId,
    label,
    active: true,
  }));

  const { error } = await db.from("lab_value_reason_categories").insert(rows);
  if (error) throw new Error(`Failed to seed reason categories: ${error.message}`);

  return { inserted: rows.length };
}

/**
 * Sanity check: every article appears in exactly PAIRS_PER_ARTICLE pairs.
 * Returns the offenders if any. Useful for tests.
 */
export async function verifyPairBalance(db: Db, moduleId: string): Promise<{ ok: boolean; offenders: { article_id: string; count: number }[] }> {
  const { data: pairs } = await db
    .from("lab_value_pairs")
    .select("article_a_id, article_b_id")
    .eq("module_id", moduleId);

  const counts = new Map<string, number>();
  type Row = { article_a_id: string; article_b_id: string };
  for (const row of (pairs ?? []) as Row[]) {
    counts.set(row.article_a_id, (counts.get(row.article_a_id) ?? 0) + 1);
    counts.set(row.article_b_id, (counts.get(row.article_b_id) ?? 0) + 1);
  }

  const offenders: { article_id: string; count: number }[] = [];
  for (const [id, c] of counts) {
    if (c !== PAIRS_PER_ARTICLE) offenders.push({ article_id: id, count: c });
  }
  return { ok: offenders.length === 0, offenders };
}
