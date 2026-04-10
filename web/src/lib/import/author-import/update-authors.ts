import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeOrcid, findOrCreateAuthor } from "@/lib/import/author-import/find-or-create";
import { normalizeAuthorName, decodeHtmlEntities, type Author } from "@/lib/import/article-import/fetcher";
import { logAuthorEvent } from "@/lib/author-events";
import { logArticleEvent } from "@/lib/article-events";

type AdminClient = ReturnType<typeof createAdminClient>;

// ── Types ───────────────────────────────────────────────────────────────────

interface OldAuthorEntry {
  foreName: string | null;
  lastName: string | null;
  orcid: string | null;
  affiliation: string | null;    // gammelt string-format
  affiliations: string[] | null; // nyt array-format
  position: number;              // 1-indekseret
  matched: boolean;
}

export type ArticleUpdateResult = {
  articleId: string;
  scenarioA: number;
  scenarioB: number;
  scenarioC: number;
  unmatched: number;
  skipped: boolean;
  error?: string;
};

export type BatchOptions = {
  dryRun: boolean;
  limit?: number;
  articleId?: string;
};

export type BatchResult = {
  processed: number;
  scenarioA: number;
  scenarioB: number;
  scenarioC: number;
  unmatched: number;
  errors: { articleId: string; error: string }[];
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeNameForComparison(str: string): string {
  return normalizeAuthorName(decodeHtmlEntities(str));
}

function buildOldEntries(authors: unknown[]): OldAuthorEntry[] {
  return authors.map((a, i) => {
    const r = a as Record<string, unknown>;
    const hasAffiliationsArray = Array.isArray(r.affiliations);
    return {
      foreName:     typeof r.foreName === "string" ? r.foreName : null,
      lastName:     typeof r.lastName === "string" ? r.lastName : null,
      orcid:        typeof r.orcid === "string" ? r.orcid : null,
      affiliation:  !hasAffiliationsArray && typeof r.affiliation === "string" ? r.affiliation : null,
      affiliations: hasAffiliationsArray ? (r.affiliations as string[]) : null,
      position:     i + 1,
      matched:      false,
    };
  });
}

function getPrimaryAffiliationString(entry: OldAuthorEntry): string | null {
  if (entry.affiliation) return entry.affiliation;
  if (entry.affiliations && entry.affiliations.length > 0) return entry.affiliations[0];
  return null;
}

function isInitialOf(oldFore: string | null, newFore: string | null): boolean {
  if (!oldFore || !newFore) return false;
  const old = decodeHtmlEntities(oldFore).trim().replace(/\.$/, "");
  const nw  = decodeHtmlEntities(newFore).trim();
  return old.length === 1 && nw.toLowerCase().startsWith(old.toLowerCase());
}

function matchInOldArray(
  newAuthor: Author,
  oldEntries: OldAuthorEntry[],
  position: number, // 1-indekseret (index + 1)
): OldAuthorEntry | null {
  const newOrcid = newAuthor.orcid ? normalizeOrcid(newAuthor.orcid) : null;

  // Niveau 1: ORCID-match (deterministisk — matched må gerne allerede være true)
  if (newOrcid) {
    const orcidMatch = oldEntries.find(e => {
      if (!e.orcid) return false;
      return normalizeOrcid(e.orcid) === newOrcid;
    });
    if (orcidMatch) return orcidMatch;
  }

  // Niveau 2: Navn + position
  const newName = normalizeNameForComparison(
    [newAuthor.foreName, newAuthor.lastName].filter(Boolean).join(" ")
  );
  const positionMatch = oldEntries.find(e => {
    if (e.matched) return false;
    if (e.position !== position) return false;
    const oldName = normalizeNameForComparison(
      [e.foreName ?? "", e.lastName ?? ""].filter(Boolean).join(" ")
    );
    return oldName === newName && oldName.length > 0;
  });
  if (positionMatch) return positionMatch;

  // Niveau 2b: Efternavn + position + initial-match på fornavn
  const newLast = normalizeNameForComparison(newAuthor.lastName ?? "");
  const pos2bMatch = oldEntries.find(e => {
    if (e.matched) return false;
    if (e.position !== position) return false;
    const oldLast = normalizeNameForComparison(e.lastName ?? "");
    if (oldLast !== newLast || oldLast.length === 0) return false;
    return isInitialOf(e.foreName, newAuthor.foreName);
  });
  if (pos2bMatch) return pos2bMatch;

  // Niveau 3: Navn + affiliation (40-tegns præfiks)
  const newAff = (newAuthor.affiliations[0] ?? "").trim().toLowerCase().slice(0, 40);
  if (newAff.length > 0) {
    const affMatch = oldEntries.find(e => {
      if (e.matched) return false;
      const oldName = normalizeNameForComparison(
        [e.foreName ?? "", e.lastName ?? ""].filter(Boolean).join(" ")
      );
      if (oldName !== newName || oldName.length === 0) return false;
      const oldAff = (getPrimaryAffiliationString(e) ?? "").trim().toLowerCase().slice(0, 40);
      return oldAff.length > 0 && oldAff === newAff;
    });
    if (affMatch) return affMatch;
  }

  return null;
}

// ── Core: processerer én artikel ────────────────────────────────────────────

export async function processArticleAuthorUpdate(
  admin: AdminClient,
  articleId: string,
  dryRun: boolean,
): Promise<ArticleUpdateResult> {
  const result: ArticleUpdateResult = {
    articleId,
    scenarioA: 0,
    scenarioB: 0,
    scenarioC: 0,
    unmatched: 0,
    skipped: false,
  };

  try {
    // Hent artikel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: article, error: artErr } = await (admin as any)
      .from("articles")
      .select("authors, authors_raw_new")
      .eq("id", articleId)
      .maybeSingle();

    if (artErr) throw new Error(artErr.message);
    if (!article || !article.authors || !article.authors_raw_new) {
      result.skipped = true;
      return result;
    }

    const oldEntries = buildOldEntries(article.authors as unknown[]);

    // Parse newAuthors — allerede i Author-format fra sync-runner
    const rawNew = article.authors_raw_new as unknown[];
    const newAuthors: Author[] = rawNew.map((a) => {
      const r = a as Record<string, unknown>;
      return {
        lastName:     typeof r.lastName  === "string" ? r.lastName  : "",
        foreName:     typeof r.foreName  === "string" ? r.foreName  : "",
        affiliations: Array.isArray(r.affiliations)   ? (r.affiliations as string[]) : [],
        orcid:        typeof r.orcid     === "string" ? r.orcid     : null,
      };
    });

    // ── Løkke over nye forfattere ────────────────────────────────────────────
    for (let i = 0; i < newAuthors.length; i++) {
      const newAuthor = newAuthors[i];
      const newPosition = i + 1;

      const matchedEntry = matchInOldArray(newAuthor, oldEntries, newPosition);

      if (matchedEntry) {
        // ── Scenarie A: match fundet ─────────────────────────────────────────
        matchedEntry.matched = true;

        // Find author_id i article_authors
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: aaRow } = await (admin as any)
          .from("article_authors")
          .select("author_id, position, orcid_on_paper")
          .eq("article_id", articleId)
          .eq("position", matchedEntry.position)
          .maybeSingle();

        if (!aaRow) {
          // Ingen article_authors-række fundet for denne position — skip update, tæl alligevel
          result.scenarioA++;
          continue;
        }

        const authorId: string = aaRow.author_id;
        const changes: Record<string, { from: unknown; to: unknown }> = {};

        const newOrcid = newAuthor.orcid ? normalizeOrcid(newAuthor.orcid) : null;
        const oldOrcidOnPaper: string | null = aaRow.orcid_on_paper ?? null;

        if (aaRow.position !== newPosition) {
          changes.position = { from: aaRow.position, to: newPosition };
        }
        if (newOrcid !== oldOrcidOnPaper) {
          changes.orcid_on_paper = { from: oldOrcidOnPaper, to: newOrcid };
        }

        if (!dryRun && Object.keys(changes).length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin as any)
            .from("article_authors")
            .update({
              ...(changes.position       ? { position:       newPosition } : {}),
              ...(changes.orcid_on_paper ? { orcid_on_paper: newOrcid    } : {}),
            })
            .eq("article_id", articleId)
            .eq("author_id", authorId);
        }

        // Opdatér authors.orcid hvis nyt ORCID og ingen eksisterende
        if (!dryRun && newOrcid) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: authorRow } = await (admin as any)
            .from("authors")
            .select("orcid, geo_locked_by")
            .eq("id", authorId)
            .maybeSingle();

          if (authorRow && !authorRow.orcid) {
            const isGeoLocked =
              authorRow.geo_locked_by === "human" || authorRow.geo_locked_by === "user";
            if (!isGeoLocked) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (admin as any)
                .from("authors")
                .update({ orcid: newOrcid })
                .eq("id", authorId);
              changes.orcid_on_author = { from: null, to: newOrcid };
            }
          }
        }

        void logAuthorEvent(authorId, "author_updated", {
          article_id:  articleId,
          match_level: matchedEntry.orcid
            ? "orcid"
            : matchedEntry.position === newPosition
              ? isInitialOf(matchedEntry.foreName, newAuthor.foreName)
                ? "name_position_initial"
                : "name_position"
              : "name_affiliation",
          changes,
        });

        result.scenarioA++;
      } else {
        // ── Scenarie B: ingen match ──────────────────────────────────────────
        if (!newAuthor.lastName && !newAuthor.orcid) {
          result.unmatched++;
          continue;
        }

        try {
          const { id: authorId } = await findOrCreateAuthor(admin, newAuthor, articleId);

          if (!dryRun) {
            const newOrcid = newAuthor.orcid ? normalizeOrcid(newAuthor.orcid) : null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (admin as any)
              .from("article_authors")
              .upsert(
                {
                  article_id:    articleId,
                  author_id:     authorId,
                  position:      newPosition,
                  orcid_on_paper: newOrcid,
                },
                { onConflict: "article_id,author_id" }
              );
          }

          void logAuthorEvent(authorId, "article_linked", {
            article_id: articleId,
            scenario:   "B",
          });

          result.scenarioB++;
        } catch (e) {
          result.unmatched++;
          console.error(`[update-authors] Scenarie B fejl artikel=${articleId} forfatter="${newAuthor.lastName}":`, e);
        }
      }
    }

    // ── Scenarie C: gamle forfattere uden match ──────────────────────────────
    const unmatchedOld = oldEntries.filter(e => !e.matched);
    for (const entry of unmatchedOld) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: aaRow } = await (admin as any)
        .from("article_authors")
        .select("author_id")
        .eq("article_id", articleId)
        .eq("position", entry.position)
        .maybeSingle();

      if (!aaRow) continue;

      const authorId: string = aaRow.author_id;

      if (!dryRun) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any)
          .from("article_authors")
          .delete()
          .eq("article_id", articleId)
          .eq("author_id", authorId);
      }

      void logAuthorEvent(authorId, "author_unlinked", {
        article_id: articleId,
        scenario:   "C",
        position:   entry.position,
      });

      result.scenarioC++;
    }

    // ── Afslut artiklen ──────────────────────────────────────────────────────
    if (!dryRun) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from("articles")
        .update({
          authors_raw_previous: article.authors,
          authors:              article.authors_raw_new,
          authors_raw_new:      null,
          authors_changed:      false,
        })
        .eq("id", articleId);

      void logArticleEvent(articleId, "authors_updated", {
        scenario_a: result.scenarioA,
        scenario_b: result.scenarioB,
        scenario_c: result.scenarioC,
        unmatched:  result.unmatched,
      });
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}

// ── Hoved-batch-funktion ─────────────────────────────────────────────────────

export async function runAuthorUpdateBatch(options: BatchOptions): Promise<BatchResult> {
  const { dryRun, limit = 100, articleId } = options;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;

  const batch: BatchResult = {
    processed: 0,
    scenarioA: 0,
    scenarioB: 0,
    scenarioC: 0,
    unmatched: 0,
    errors:    [],
  };

  console.log(`\n${"─".repeat(60)}`);
  console.log(`[update-authors] ${dryRun ? "DRY RUN" : "LIVE"} — limit=${articleId ? "1 (specificeret)" : limit}`);
  console.log(`${"─".repeat(60)}`);

  let query = a
    .from("articles")
    .select("id")
    .eq("authors_changed", true)
    .not("authors_raw_new", "is", null)
    .order("id");

  if (articleId) {
    query = query.eq("id", articleId);
  } else {
    query = query.limit(limit);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`[update-authors] Hentning fejlede: ${error.message}`);

  const ids: string[] = (rows ?? []).map((r: { id: string }) => r.id);
  console.log(`[update-authors] Fandt ${ids.length} artikel(er) til behandling`);

  for (const id of ids) {
    const res = await processArticleAuthorUpdate(admin, id, dryRun);
    batch.processed++;
    batch.scenarioA += res.scenarioA;
    batch.scenarioB += res.scenarioB;
    batch.scenarioC += res.scenarioC;
    batch.unmatched += res.unmatched;

    if (res.error) {
      batch.errors.push({ articleId: id, error: res.error });
      console.error(`[update-authors] FEJL artikel=${id}: ${res.error}`);
    } else if (!res.skipped) {
      console.log(
        `[update-authors] artikel=${id} A=${res.scenarioA} B=${res.scenarioB} C=${res.scenarioC} umatched=${res.unmatched}`
      );
    }
  }

  console.log(`\n[update-authors] FÆRDIG — processed=${batch.processed} A=${batch.scenarioA} B=${batch.scenarioB} C=${batch.scenarioC} unmatched=${batch.unmatched} errors=${batch.errors.length}`);
  console.log(`${"─".repeat(60)}\n`);

  return batch;
}
