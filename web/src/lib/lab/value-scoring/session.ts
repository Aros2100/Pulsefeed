// Session helpers for the pairwise phase.
// A session = up to SESSION_SIZE pairs sharing the same session_id.
// The "open session" is the most recent session that has fewer than SESSION_SIZE
// completed (winner_id != NULL) pairs. If no open session exists, a new one
// is created when the next pair is taken.

import { CRAFT_MODULE_KEY, SESSION_SIZE } from "./craft-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function resolveModule(db: Db): Promise<{
  ok: true; moduleId: string; phase: string;
} | { ok: false; status: number; error: string }> {
  const { data: mod } = await db
    .from("lab_modules")
    .select("id, phase")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  if (!mod) return { ok: false, status: 404, error: "Module not found" };
  if (mod.phase !== "pairwise") return { ok: false, status: 409, error: "Module is not in pairwise phase" };
  return { ok: true, moduleId: mod.id as string, phase: mod.phase as string };
}

/** Find the current open session (fewer than SESSION_SIZE decided pairs). */
export async function findOpenSession(db: Db, moduleId: string): Promise<string | null> {
  const { data: pairs } = await db
    .from("lab_value_pairs")
    .select("session_id, winner_id, updated_at")
    .eq("module_id", moduleId)
    .not("session_id", "is", null)
    .order("updated_at", { ascending: false });

  type Row = { session_id: string; winner_id: string | null };
  const rows = (pairs ?? []) as Row[];

  // Group by session_id, count decided pairs (winner_id != NULL)
  const decidedBySession = new Map<string, number>();
  const totalBySession   = new Map<string, number>();
  for (const r of rows) {
    totalBySession.set(r.session_id, (totalBySession.get(r.session_id) ?? 0) + 1);
    if (r.winner_id !== null) {
      decidedBySession.set(r.session_id, (decidedBySession.get(r.session_id) ?? 0) + 1);
    }
  }

  // Find the most recent session with fewer than SESSION_SIZE decided pairs
  // We iterate the rows in updated_at desc order; first session with decided<SESSION_SIZE wins
  for (const r of rows) {
    const decided = decidedBySession.get(r.session_id) ?? 0;
    if (decided < SESSION_SIZE) return r.session_id;
  }
  return null;
}

/** Number of decided pairs in a session. */
export async function sessionDecidedCount(db: Db, sessionId: string): Promise<number> {
  const { count } = await db
    .from("lab_value_pairs")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .not("winner_id", "is", null);
  return count ?? 0;
}
