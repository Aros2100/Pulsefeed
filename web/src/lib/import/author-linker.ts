import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { decodeHtmlEntities, type Author } from "@/lib/import/artikel-import/fetcher";
import { linkAuthorsToArticle } from "@/lib/import/forfatter-import/find-or-create";
import { runLinkingChecks } from "@/lib/import/quality-checks";
import { logArticleEvent, logGeoUpdatedEvent, type GeoSnapshot } from "@/lib/article-events";
import { notifyFollowedAuthorPublications } from "@/lib/notifications/followedAuthorNotify";
import { getRegion, getContinent } from "@/lib/geo/country-map";
import { lookupState } from "@/lib/geo/state-map";
import { getCityCache, normalizeCityKey } from "@/lib/geo/city-cache";
import { fetchWorksByDois, type OpenAlexWork } from "@/lib/openalex/client";
import pLimit from "p-limit";

const BATCH_SIZE = 100;
const LINK_CONCURRENCY = 3;

export async function runAuthorLinking(logId: string, importLogId?: string): Promise<void> {
  const admin = createAdminClient();
  const errors: string[] = [];
  const linkedArticleIds: string[] = [];
  let articlesProcessed = 0;
  let authorsLinked = 0;
  let authorsProcessed = 0;
  let newAuthors = 0;
  let duplicates = 0;
  let rejected = 0;

  try {
    if (importLogId) {
      await admin
        .from("author_linking_logs")
        .update({ import_log_id: importLogId })
        .eq("id", logId);
    }

    while (true) {
      // Always fetch at offset 0 — linked articles are removed from the unlinked
      // set by the NOT IN clause, so the result shrinks as we process each batch.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: articles, error } = await (admin as any).rpc(
        "fetch_unlinked_articles",
        { p_offset: 0, p_limit: BATCH_SIZE }
      ) as { data: Array<{ id: string; pubmed_id: string; doi: string | null; authors: unknown }> | null; error: { message: string } | null };

      if (error) {
        console.error(`[author-linker] RPC error:`, error.message);
        errors.push(`Query error: ${error.message}`);
        break;
      }

      const batch = articles ?? [];
      console.error(`[author-linker] RPC returned ${batch.length} articles (data type: ${typeof articles}, isArray: ${Array.isArray(articles)})`);
      if (batch.length === 0) break;

      // Batch DOI → OpenAlex works lookup
      const doisInBatch = batch
        .map(a => ({ id: a.id, doi: a.doi as string | null }))
        .filter((a): a is { id: string; doi: string } => Boolean(a.doi));

      let oaWorksMap = new Map<string, OpenAlexWork>();
      if (doisInBatch.length > 0) {
        try {
          oaWorksMap = await fetchWorksByDois(doisInBatch.map(a => a.doi));
          console.error(`[author-linker] OpenAlex: ${oaWorksMap.size}/${doisInBatch.length} works found`);
        } catch (e) {
          console.warn(`[author-linker] OpenAlex batch failed, falling back to parser:`, e);
        }
      }

      const limiter = pLimit(LINK_CONCURRENCY);
      await Promise.all(
        batch.map((article) => limiter(async () => {
          const rawAuthors = (article.authors ?? []) as Record<string, unknown>[];
          console.error(`[author-linker] PMID ${article.pubmed_id}: authors field type=${typeof article.authors}, rawAuthors.length=${rawAuthors.length}`);
          if (rawAuthors.length === 0) {
            articlesProcessed++;
            return;
          }

          const authors: Author[] = rawAuthors.map((a) => ({
            lastName:    decodeHtmlEntities(String(a.lastName ?? "")),
            foreName:    decodeHtmlEntities(String(a.foreName ?? "")),
            affiliations: Array.isArray(a.affiliations)
              ? (a.affiliations as string[])
              : a.affiliation != null ? [String(a.affiliation)] : [],
            orcid:       a.orcid != null ? String(a.orcid) : null,
          }));

          const rejectedAuthors = authors.filter(
            (a) => !a.lastName?.trim() && !a.orcid?.trim()
          );

          const articleDoi = (article.doi as string | null);
          const oaWork = articleDoi ? oaWorksMap.get(articleDoi.toLowerCase()) ?? null : null;

          // Fill missing affiliations from OpenAlex raw_affiliation_strings (index-matched).
          // Never overwrite existing PubMed affiliation data.
          if (oaWork && oaWork.authorships.length > 0) {
            let oaPatched = false;
            const patchedRaw = rawAuthors.map((ra, i) => {
              const hasAff =
                (Array.isArray(ra.affiliations) && (ra.affiliations as string[]).length > 0) ||
                ra.affiliation != null;
              if (!hasAff) {
                const oaAff = oaWork.authorships[i]?.rawAffiliationStrings[0];
                if (oaAff) {
                  oaPatched = true;
                  authors[i] = { ...authors[i], affiliations: [oaAff] };
                  return { ...ra, affiliation: oaAff };
                }
              }
              return ra;
            });
            if (oaPatched) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (admin as any).from("articles").update({ authors: patchedRaw }).eq("id", article.id);
            }
          }

          console.error(`[author-linker] calling linkAuthorsToArticle for PMID ${article.pubmed_id} (${authors.length} authors, oaWork=${oaWork ? 'yes' : 'no'})`);
          await linkAuthorsToArticle(admin, article.id, authors, oaWork)
            .then(async (result) => {
              newAuthors      += result.new;
              duplicates      += result.duplicates;
              rejected        += result.rejected;
              authorsLinked   += result.new + result.duplicates;
              authorsProcessed += result.new + result.duplicates + result.rejected;
              console.error(`[author-linker] linked PMID ${article.pubmed_id} — new=${result.new} dup=${result.duplicates} rejected=${result.rejected}`);

              const hasRoohollahi = authors.some(a => a.lastName === "Roohollahi");
              if (hasRoohollahi) {
                console.log(`[GEO-DEBUG Roohollahi] firstAuthorGeo after linkAuthorsToArticle:`, JSON.stringify(result.firstAuthorGeo));
                console.log(`[GEO-DEBUG Roohollahi] lastAuthorGeo after linkAuthorsToArticle:`, JSON.stringify(result.lastAuthorGeo));
              }

              // Populate article geo fields from first/last author affiliation
              if (result.firstAuthorGeo || result.lastAuthorGeo) {
                // Guard: if article already has geo_country, the deterministic parser
                // has already set correct geo — skip the author-linker write.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: existingGeo } = await (admin as any)
                  .from("articles")
                  .select("geo_country")
                  .eq("id", article.id)
                  .single();
                if (existingGeo?.geo_country) {
                  // Parser geo takes precedence — do not overwrite
                } else {

                const first = result.firstAuthorGeo;
                const last = result.lastAuthorGeo;

                // City→country fallback: if parser found city but not country, try city-cache
                let effectiveCountry = first?.country ?? null;
                if (!effectiveCountry && first?.city) {
                  const cityCache = await getCityCache();
                  effectiveCountry = cityCache.countryMap.get(normalizeCityKey(first.city)) ?? null;
                }

                const firstRegion = effectiveCountry ? getRegion(effectiveCountry) : null;
                const firstContinent = effectiveCountry ? getContinent(effectiveCountry) : null;
                const firstState = first?.state ?? (first?.city && effectiveCountry ? lookupState(first.city, effectiveCountry) : null);
                void last; // last author geo no longer written to separate columns

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const db = admin as any;
                const geoUpdate = {
                  geo_department: first?.department ?? null,
                  geo_continent: firstContinent,
                  geo_region: firstRegion,
                  geo_country: effectiveCountry,
                  geo_state: firstState,
                  geo_city: first?.city ?? null,
                  geo_institution: first?.institution ?? null,
                  location_parsed_at: new Date().toISOString(),
                  location_confidence: first?.confidence ?? (last?.confidence ?? null),
                };
                if (hasRoohollahi) {
                  console.log(`[GEO-DEBUG Roohollahi] writing to articles table:`, JSON.stringify(geoUpdate));
                }
                await db.from("articles").update(geoUpdate).eq("id", article.id);
                const geoNext: GeoSnapshot = {
                  geo_department: geoUpdate.geo_department,
                  geo_continent: geoUpdate.geo_continent,
                  geo_region: geoUpdate.geo_region,
                  geo_country: geoUpdate.geo_country,
                  geo_state: geoUpdate.geo_state,
                  geo_city: geoUpdate.geo_city,
                  geo_institution: geoUpdate.geo_institution,
                };
                logGeoUpdatedEvent(article.id, "author_linker", null, geoNext);
                } // end else (no existing geo_country)
              }

              if (rejectedAuthors.length > 0) {
                const rejects = rejectedAuthors.map((a, idx) => ({
                  article_id:     article.id,
                  pubmed_id:      article.pubmed_id,
                  position:       rawAuthors.findIndex(
                    (r) => r.lastName === a.lastName && r.foreName === a.foreName
                  ) + 1 || idx + 1,
                  raw_data:       (rawAuthors.find(
                    (r) => r.lastName === a.lastName && r.foreName === a.foreName
                  ) ?? {}) as Json,
                  reason:         "no_lastname_no_orcid",
                  linking_log_id: logId,
                }));
                await admin.from("rejected_authors").insert(rejects);
              }

              linkedArticleIds.push(article.id);

              void logArticleEvent(article.id, "author_linked", {
                authors_linked: result.new + result.duplicates,
                new:        result.new,
                duplicates: result.duplicates,
                rejected:   result.rejected,
              });
            })
            .catch((e) => {
              const msg = `PMID ${article.pubmed_id}: ${e instanceof Error ? e.message : String(e)}`;
              errors.push(msg);
              console.error(`[author-linker] error — ${msg}`);
            });

          articlesProcessed++;
        }))
      );

      // Update progress after each batch
      console.error(`[author-linker] writing progress to DB — logId=${logId} articles_processed=${articlesProcessed} authors_linked=${authorsLinked}`);
      const { error: updateErr } = await admin
        .from("author_linking_logs")
        .update({ articles_processed: articlesProcessed, authors_linked: authorsLinked, authors_processed: authorsProcessed, new_authors: newAuthors, duplicates, rejected })
        .eq("id", logId);
      if (updateErr) {
        console.error(`[author-linker] progress update failed:`, updateErr.message);
      } else {
        console.error(`[author-linker] progress update OK`);
      }

      console.error(`[author-linker] batch done — articles=${articlesProcessed} authors=${authorsLinked}`);

      if (batch.length < BATCH_SIZE) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    // Notify users who follow any of the newly linked authors (fire-and-forget)
    if (linkedArticleIds.length > 0) {
      void notifyFollowedAuthorPublications(linkedArticleIds).catch((e) => {
        console.warn("[author-linker] notifyFollowedAuthorPublications error:", e);
      });
    }

    // Mark completed
    await admin
      .from("author_linking_logs")
      .update({
        status: errors.length > 0 && articlesProcessed === 0 ? "failed" : "completed",
        completed_at: new Date().toISOString(),
        articles_processed: articlesProcessed,
        authors_linked: authorsLinked,
        authors_processed: authorsProcessed,
        new_authors: newAuthors,
        duplicates,
        rejected,
        errors: errors.length > 0 ? errors : [],
      })
      .eq("id", logId);

    console.error(`[author-linker] done — articles=${articlesProcessed} authors=${authorsLinked} errors=${errors.length}`);

    // Linking quality checks
    try {
      const qc = await runLinkingChecks(logId);
      if (!qc.passed) {
        console.warn(
          `[author-linker] Linking checks failed for linking log ${logId}: ` +
          `${qc.failedChecks}/${qc.totalChecks} checks failed — ` +
          qc.checks.filter(c => !c.passed).map(c => c.message).join("; ")
        );
      }
    } catch (qcErr) {
      console.warn(`[author-linker] Linking checks threw for ${logId}:`, qcErr);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[author-linker] fatal error:`, e);
    await admin
      .from("author_linking_logs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        errors: [...errors, msg],
      })
      .eq("id", logId);
  }
}
