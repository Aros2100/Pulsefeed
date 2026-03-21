import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RelativeTime from "@/components/RelativeTime";

interface HistoryRow {
  visited_at: string | null;
  articles: {
    id:             string;
    title:          string;
    journal_abbr:   string | null;
    published_date: string | null;
  } | null;
}

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("reading_history")
    .select("visited_at, articles(id, title, journal_abbr, published_date)")
    .eq("user_id", user.id)
    .order("visited_at", { ascending: false })
    .limit(100);

  const history = (rows ?? []) as HistoryRow[];

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "26px", fontWeight: 700 }}>Reading History</div>
          <div style={{ fontSize: "14px", color: "#888", marginTop: "4px" }}>Your 100 most recently viewed articles</div>
        </div>

        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              Recent articles · {history.length} total
            </div>
          </div>

          {history.length === 0 ? (
            <div style={{ padding: "24px", fontSize: "14px", color: "#888" }}>No reading history yet</div>
          ) : (
            history.map((row, i) => {
              const a    = row.articles;
              if (!a) return null;
              const meta = [a.journal_abbr, a.published_date?.slice(0, 7)].filter(Boolean).join(" · ");
              return (
                <div key={a.id + (row.visited_at ?? "")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderTop: i === 0 ? undefined : "1px solid #f0f0f0" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Link href={`/articles/${a.id}`} style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", textDecoration: "none" }}>
                      {a.title}
                    </Link>
                    {meta && <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{meta}</div>}
                  </div>
                  <div style={{ marginLeft: "16px", flexShrink: 0, fontSize: "12px", color: "#9ca3af", whiteSpace: "nowrap" }}>
                    {row.visited_at && <RelativeTime iso={row.visited_at} />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
