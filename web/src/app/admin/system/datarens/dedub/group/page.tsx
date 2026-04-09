import { createAdminClient } from "@/lib/supabase/admin";
import GroupClient from "./GroupClient";
import Link from "next/link";

interface AuthorRow {
  id: string;
  display_name: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  hospital: string | null;
  openalex_id: string | null;
  orcid: string | null;
  article_count: number | null;
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
        <p style={{ color: "#888", fontSize: "13px", marginBottom: "16px" }}>{message}</p>
        <Link href="/admin/datarens/dedub" style={{ fontSize: "13px", color: "#E83B2A", textDecoration: "none", fontWeight: 600 }}>
          ← tilbage
        </Link>
      </div>
    </div>
  );
}

export default async function GroupPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: encoded } = await searchParams;

  if (!encoded) return <ErrorPage message="Ingen gruppe angivet." />;

  let authorIds: string[];
  try {
    authorIds = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as string[];
    if (!Array.isArray(authorIds) || authorIds.length === 0) throw new Error();
  } catch {
    return <ErrorPage message="Ugyldig gruppe." />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("authors")
    .select("id, display_name, country, state, city, hospital, openalex_id, orcid, article_count")
    .in("id", authorIds) as { data: AuthorRow[] | null };

  // Preserve the order returned by the RPC
  const byId = new Map((data ?? []).map((a) => [a.id, a]));
  const authors = authorIds.map((id) => byId.get(id)).filter((a): a is AuthorRow => !!a);

  if (authors.length === 0) return <ErrorPage message="Ingen forfattere fundet." />;

  return <GroupClient authors={authors} />;
}
