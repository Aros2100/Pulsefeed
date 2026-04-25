import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveRawXml } from "@/lib/import/article-import/raw-writer";

const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const BATCH_SIZE = 20;
const RATE_MS = 150;

function apiKey(): string {
  return process.env.PUBMED_API_KEY ?? "";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function splitPubmedArticles(xml: string): { pmid: string; xml: string }[] {
  const result: { pmid: string; xml: string }[] = [];
  const articleRegex = /<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g;
  const matches = xml.match(articleRegex) ?? [];
  for (const articleXml of matches) {
    const pmidMatch = articleXml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    if (!pmidMatch) continue;
    result.push({ pmid: pmidMatch[1], xml: articleXml });
  }
  return result;
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // Optional: limit how many articles to backfill in this run
  let limit = 20_000;
  try {
    const body = await req.json() as { limit?: number };
    if (body.limit && typeof body.limit === "number") limit = body.limit;
  } catch { /* no body */ }

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
      // Fetch all articles missing raw XML, newest first
      const missing: { id: string; pubmed_id: string }[] = [];
      let page = 0;
      const PAGE = 1_000;
      for (;;) {
        const { data, error } = await admin
          .from("articles")
          .select("id, pubmed_id")
          .is("pubmed_raw_latest_at", null)
          .order("imported_at", { ascending: false })
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) throw new Error(`DB query failed: ${error.message}`);
        missing.push(...((data ?? []) as { id: string; pubmed_id: string }[]));
        if (!data || data.length < PAGE || missing.length >= limit) break;
        page++;
      }

      const toProcess = missing.slice(0, limit);
      const total = toProcess.length;
      send({ type: "start", total });

      let processed = 0;
      let errors = 0;

      // Build pubmed_id → article_id map
      const idMap = new Map<string, string>();
      for (const row of toProcess) idMap.set(row.pubmed_id, row.id);

      const pmids = toProcess.map((r) => r.pubmed_id);

      for (let i = 0; i < pmids.length; i += BATCH_SIZE) {
        const batch = pmids.slice(i, i + BATCH_SIZE);

        try {
          const params = new URLSearchParams({
            db: "pubmed",
            id: batch.join(","),
            retmode: "xml",
          });
          const key = apiKey();
          if (key) params.set("api_key", key);

          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 30_000);
          const res = await fetch(`${BASE_URL}/efetch.fcgi?${params}`, { signal: ctrl.signal });
          clearTimeout(timer);

          if (!res.ok) throw new Error(`EFetch HTTP ${res.status}`);

          const xml = await res.text();
          const split = splitPubmedArticles(xml);

          const rawRows = split
            .filter(({ pmid }) => idMap.has(pmid))
            .map(({ pmid, xml: articleXml }) => ({
              articleId: idMap.get(pmid)!,
              pubmedId: pmid,
              rawXml: articleXml,
            }));

          if (rawRows.length > 0) {
            await saveRawXml(admin, rawRows, "backfill");
          }

          processed += batch.length;
        } catch (e) {
          errors += batch.length;
          const msg = String((e as Error)?.message ?? e).slice(0, 200);

          // Log failures to pubmed_sync_failures table
          const now = new Date().toISOString();
          for (const pmid of batch) {
            await a.from("pubmed_sync_failures").upsert({
              pubmed_id: pmid,
              first_failed_at: now,
              last_failed_at: now,
              attempts: 1,
              last_error: `backfill: ${msg}`,
              resolved_at: null,
              run_started_at: now,
            }, { onConflict: "pubmed_id" });
          }
        }

        send({ type: "progress", processed, total, errors });

        if (i + BATCH_SIZE < pmids.length) await sleep(RATE_MS);
      }

      send({ type: "done", processed, total, errors });
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
