import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTitleAndAbstract } from "@/lib/import/article-import/parse-single";

function compareTitle(dbTitle: string, xmlTitle: string): boolean {
  return dbTitle.normalize("NFC").trim() !== xmlTitle.normalize("NFC").trim();
}

function compareAbstract(dbAbstract: string | null, xmlAbstract: string | null): boolean {
  if (dbAbstract === null && xmlAbstract === null) return false;
  if (dbAbstract === null || xmlAbstract === null) return true;
  return dbAbstract.normalize("NFC").trim() !== xmlAbstract.normalize("NFC").trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();

  const send = (data: object) => {
    void writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  (async () => {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = admin as any;

    try {
      // Fetch articles that have raw XML
      const articles: { id: string; pubmed_id: string; title: string | null; abstract: string | null }[] = [];
      let page = 0;
      const PAGE = 1_000;
      for (;;) {
        const { data, error } = await admin
          .from("articles")
          .select("id, pubmed_id, title, abstract")
          .not("pubmed_raw_latest_at", "is", null)
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) throw new Error(`DB query failed: ${error.message}`);
        articles.push(...((data ?? []) as typeof articles));
        if (!data || data.length < PAGE) break;
        page++;
      }

      const total = articles.length;
      send({ type: "start", total });

      let processed = 0;
      let diffsFound = 0;
      let errors = 0;

      const CHUNK = 100;
      for (let i = 0; i < articles.length; i += CHUNK) {
        const chunk = articles.slice(i, i + CHUNK);
        const articleIds = chunk.map((a) => a.id);

        // Get latest raw XML row per article
        const { data: rawRows, error: rawErr } = await a
          .from("article_pubmed_raw")
          .select("id, article_id, raw_xml")
          .in("article_id", articleIds)
          .order("fetched_at", { ascending: false });

        if (rawErr) {
          errors += chunk.length;
          processed += chunk.length;
          send({ type: "progress", processed, total, diffsFound, errors });
          continue;
        }

        // Keep only the latest row per article_id
        const latestRaw = new Map<string, { id: string; raw_xml: string }>();
        for (const row of (rawRows ?? []) as { id: string; article_id: string; raw_xml: string }[]) {
          if (!latestRaw.has(row.article_id)) {
            latestRaw.set(row.article_id, { id: row.id, raw_xml: row.raw_xml });
          }
        }

        const diffsToInsert: {
          article_id: string;
          raw_id: string;
          field: string;
          db_value: string | null;
          xml_value: string | null;
        }[] = [];

        for (const article of chunk) {
          const raw = latestRaw.get(article.id);
          if (!raw) continue;

          let parsed: { title: string; abstract: string | null };
          try {
            parsed = parseTitleAndAbstract(raw.raw_xml);
          } catch {
            errors++;
            continue;
          }

          if (compareTitle(article.title ?? "", parsed.title)) {
            diffsToInsert.push({
              article_id: article.id,
              raw_id: raw.id,
              field: "title",
              db_value: article.title,
              xml_value: parsed.title || null,
            });
          }

          if (compareAbstract(article.abstract, parsed.abstract)) {
            diffsToInsert.push({
              article_id: article.id,
              raw_id: raw.id,
              field: "abstract",
              db_value: article.abstract,
              xml_value: parsed.abstract,
            });
          }
        }

        // Insert diffs with idempotency check: skip if pending diff already exists for (article_id, raw_id, field)
        if (diffsToInsert.length > 0) {
          const now = new Date().toISOString();
          const rows = diffsToInsert.map((d) => ({ ...d, detected_at: now, resolution: "pending" }));

          // Use upsert with ON CONFLICT DO NOTHING on (article_id, raw_id, field)
          // Since there's no unique constraint, filter manually via existing pending diffs
          const keys = diffsToInsert.map((d) => `${d.article_id}:${d.raw_id}:${d.field}`);
          const { data: existing } = await a
            .from("article_pubmed_diffs")
            .select("article_id, raw_id, field")
            .in("article_id", diffsToInsert.map((d) => d.article_id))
            .eq("resolution", "pending");

          const existingKeys = new Set(
            ((existing ?? []) as { article_id: string; raw_id: string; field: string }[])
              .map((e) => `${e.article_id}:${e.raw_id}:${e.field}`)
          );

          const newRows = rows.filter((_, idx) => !existingKeys.has(keys[idx]));
          if (newRows.length > 0) {
            await a.from("article_pubmed_diffs").insert(newRows);
            diffsFound += newRows.length;
          }
        }

        processed += chunk.length;
        send({ type: "progress", processed, total, diffsFound, errors });

        if (i + CHUNK < articles.length) await sleep(50);
      }

      send({ type: "done", processed, total, diffsFound, errors });
    } catch (e) {
      send({ type: "error", error: String((e as Error)?.message ?? e) });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
