import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { decodeHtmlEntities, type Author } from "@/lib/import/article-import/fetcher";
import { linkAuthorsToArticle } from "@/lib/import/author-import/find-or-create";
import { runLinkingChecks } from "@/lib/import/quality-checks";
import { logArticleEvent, logGeoUpdatedEvent, type GeoSnapshot } from "@/lib/article-events";
import { notifyFollowedAuthorPublications } from "@/lib/notifications/followedAuthorNotify";
import { fetchWorksByDois, type OpenAlexWork } from "@/lib/openalex/client";
import { determineArticleGeo } from "@/lib/import/author-import/find-or-create";
import { getRegion, getContinent } from "@/lib/geo/country-map";
import { enrichArticleAddresses } from "@/lib/geo/v2/address-enrichment";
import pLimit from "p-limit";

const BATCH_SIZE = 250;
const LINK_CONCURRENCY = 8;

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

          const allRejected = rawAuthors.every(
            (a) => !String(a.lastName ?? "").trim() && !String(a.orcid ?? "").trim()
          );

          if (rawAuthors.length === 0 || allRejected) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (admin as any).from("articles")
              .update({ authors_unresolvable: true })
              .eq("id", article.id);
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

              // Guard: skip if parser already ran for this article (tracked in article_geo_metadata).
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: existingMeta } = await (admin as any)
                .from("article_geo_metadata")
                .select("parser_processed_at")
                .eq("article_id", article.id)
                .maybeSingle();

              if (!existingMeta?.parser_processed_at) {
                const firstOaAuthorship = oaWork?.authorships[0] ?? null;
                const geoResult = await determineArticleGeo(admin, authors[0], firstOaAuthorship);

                const now = new Date().toISOString();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const db = admin as any;

                // 1. Write geo_class to articles. All flat geo_* fields stay null — data lives in article_geo_addresses.
                await db.from("articles").update({
                  geo_class: geoResult.geo_class,
                }).eq("id", article.id);

                // 1b. Klasse A: write position=1 row to article_geo_addresses
                if (geoResult.geo_class === "A" && geoResult.geo_country) {
                  await db.from("article_geo_addresses").delete().eq("article_id", article.id);
                  await db.from("article_geo_addresses").insert({
                    article_id:            article.id,
                    position:              1,
                    city:                  geoResult.geo_city,
                    state:                 geoResult.geo_state,
                    country:               geoResult.geo_country,
                    region:                geoResult.geo_region,
                    continent:             geoResult.geo_continent,
                    institution:           geoResult.geo_institution,
                    institution2:          geoResult.geo_institution2,
                    institution3:          geoResult.geo_institution3,
                    institutions_overflow: geoResult.geo_institutions_overflow ?? [],
                    department:            geoResult.geo_department,
                    department2:           geoResult.geo_department2,
                    department3:           geoResult.geo_department3,
                    departments_overflow:  geoResult.geo_departments_overflow ?? [],
                    confidence:            geoResult.parser_confidence,
                    state_source:          geoResult.geo_state ? "parser" : null,
                  });
                  await enrichArticleAddresses(article.id);
                }

                // 1c. Klasse B: replace per-row data in article_geo_addresses with region/continent enrichment
                if (geoResult.geo_class === "B" && geoResult.class_b_addresses) {
                  await db.from("article_geo_addresses").delete().eq("article_id", article.id);

                  const insertRows = geoResult.class_b_addresses.map((addr) => ({
                    article_id:            article.id,
                    position:              addr.position,
                    city:                  addr.city,
                    state:                 addr.state,
                    country:               addr.country,
                    region:                addr.country ? getRegion(addr.country) : null,
                    continent:             addr.country ? getContinent(addr.country) : null,
                    institution:           addr.institution,
                    institution2:          addr.institution2,
                    institution3:          addr.institution3,
                    institutions_overflow: addr.institutions_overflow,
                    department:            addr.department,
                    department2:           addr.department2,
                    department3:           addr.department3,
                    departments_overflow:  addr.departments_overflow,
                    confidence:            addr.confidence,
                    state_source:          addr.state ? "parser" : null,
                  }));
                  await db.from("article_geo_addresses").insert(insertRows);
                  // Enrich missing states via geo_cities lookup
                  await enrichArticleAddresses(article.id);
                }

                // 2. Upsert parser metadata to article_geo_metadata
                await db.from("article_geo_metadata").upsert({
                  article_id:            article.id,
                  geo_confidence:        geoResult.geo_confidence,
                  parser_processed_at:   now,
                  parser_version:        geoResult.parser_version,
                  enriched_at:           geoResult.enriched_state_source ? now : null,
                  enriched_state_source: geoResult.enriched_state_source,
                  class_b_address_count: geoResult.geo_class === "B" ? geoResult.class_b_addresses?.length ?? null : null,
                  updated_at:            now,
                }, { onConflict: "article_id" });

                // 3. Event log
                const geoNext: GeoSnapshot = {
                  geo_city:        geoResult.geo_city,
                  geo_country:     geoResult.geo_country,
                  geo_state:       geoResult.geo_state,
                  geo_region:      geoResult.geo_region,
                  geo_continent:   geoResult.geo_continent,
                  geo_institution: geoResult.geo_institution,
                  geo_department:  geoResult.geo_department,
                };
                if (geoResult.geo_class === "A" && geoResult.geo_country) {
                  logGeoUpdatedEvent(article.id, geoResult.geo_source ?? "parser", null, geoNext, geoResult.parser_confidence);
                }
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

      // Normalize geo city abbreviations after each batch
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: normErr } = await (admin as any).rpc("normalize_geo_city");
        if (normErr) console.error("[author-linker] normalize_geo_city failed:", normErr.message);
      } catch (normErr) {
        console.error("[author-linker] normalize_geo_city threw:", normErr);
      }

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
