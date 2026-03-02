import { createAdminClient } from "@/lib/supabase/admin";
import { linkAuthorsToArticle, decodeHtmlEntities, type Author } from "@/lib/pubmed/importer";

const BATCH_SIZE = 20;

export async function runAuthorLinking(logId: string, importLogId?: string): Promise<void> {
  const admin = createAdminClient();
  const errors: string[] = [];
  let articlesProcessed = 0;
  let authorsLinked = 0;
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
      const { data: articles, error } = await admin.rpc(
        "fetch_unlinked_articles",
        { p_offset: 0, p_limit: BATCH_SIZE }
      );

      if (error) {
        console.error(`[author-linker] RPC error:`, error.message);
        errors.push(`Query error: ${error.message}`);
        break;
      }

      const batch = articles ?? [];
      console.log(`[author-linker] RPC returned ${batch.length} articles (data type: ${typeof articles}, isArray: ${Array.isArray(articles)})`);
      if (batch.length === 0) break;

      for (const article of batch) {
        const rawAuthors = (article.authors ?? []) as Record<string, unknown>[];
        console.log(`[author-linker] PMID ${article.pubmed_id}: authors field type=${typeof article.authors}, rawAuthors.length=${rawAuthors.length}`);
        if (rawAuthors.length === 0) {
          articlesProcessed++;
          continue;
        }

        const authors: Author[] = rawAuthors.map((a) => ({
          lastName:    decodeHtmlEntities(String(a.lastName ?? "")),
          foreName:    decodeHtmlEntities(String(a.foreName ?? "")),
          affiliation: a.affiliation != null ? String(a.affiliation) : null,
          orcid:       a.orcid != null ? String(a.orcid) : null,
        }));

        const rejectedAuthors = authors.filter(
          (a) => !a.lastName?.trim() && !a.orcid?.trim()
        );

        console.log(`[author-linker] calling linkAuthorsToArticle for PMID ${article.pubmed_id} (${authors.length} authors)`);
        await linkAuthorsToArticle(admin, article.id, authors)
          .then(async (result) => {
            newAuthors  += result.new;
            duplicates  += result.duplicates;
            rejected    += result.rejected;
            authorsLinked += result.new + result.duplicates;
            console.log(`[author-linker] linked PMID ${article.pubmed_id} — new=${result.new} dup=${result.duplicates} rejected=${result.rejected}`);

            if (rejectedAuthors.length > 0) {
              const rejects = rejectedAuthors.map((a, idx) => ({
                article_id:     article.id,
                pubmed_id:      article.pubmed_id,
                position:       rawAuthors.findIndex(
                  (r) => r.lastName === a.lastName && r.foreName === a.foreName
                ) + 1 || idx + 1,
                raw_data:       rawAuthors.find(
                  (r) => r.lastName === a.lastName && r.foreName === a.foreName
                ) ?? {},
                reason:         "no_lastname_no_orcid",
                linking_log_id: logId,
              }));
              await admin.from("rejected_authors").insert(rejects);
            }
          })
          .catch((e) => {
            const msg = `PMID ${article.pubmed_id}: ${e instanceof Error ? e.message : String(e)}`;
            errors.push(msg);
            console.error(`[author-linker] error — ${msg}`);
          });

        articlesProcessed++;
      }

      // Update progress after each batch
      console.log(`[author-linker] writing progress to DB — logId=${logId} articles_processed=${articlesProcessed} authors_linked=${authorsLinked}`);
      const { error: updateErr } = await admin
        .from("author_linking_logs")
        .update({ articles_processed: articlesProcessed, authors_linked: authorsLinked, new_authors: newAuthors, duplicates, rejected })
        .eq("id", logId);
      if (updateErr) {
        console.error(`[author-linker] progress update failed:`, updateErr.message);
      } else {
        console.log(`[author-linker] progress update OK`);
      }

      console.log(`[author-linker] batch done — articles=${articlesProcessed} authors=${authorsLinked}`);

      if (batch.length < BATCH_SIZE) break;
    }

    // Mark completed
    await admin
      .from("author_linking_logs")
      .update({
        status: errors.length > 0 && articlesProcessed === 0 ? "failed" : "completed",
        completed_at: new Date().toISOString(),
        articles_processed: articlesProcessed,
        authors_linked: authorsLinked,
        new_authors: newAuthors,
        duplicates,
        rejected,
        errors: errors.length > 0 ? errors : [],
      })
      .eq("id", logId);

    console.log(`[author-linker] done — articles=${articlesProcessed} authors=${authorsLinked} errors=${errors.length}`);
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
