import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";

function fmtDate(iso: string | null): string {
  if (!iso) return "Aldrig";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function LabPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("specialty_slugs")
    .eq("id", user!.id)
    .single();

  const userSpecialties: string[] = (profile?.specialty_slugs as string[] | null) ?? [];
  const activeSpec = SPECIALTIES.find(
    (s) => s.active && userSpecialties.includes(s.slug)
  ) ?? SPECIALTIES.find((s) => s.active);

  const specialty = activeSpec?.slug ?? "neurosurgery";
  const specialtyLabel = activeSpec?.label ?? "Neurosurgery";

  const admin = createAdminClient();

  const [queueResult, totalResult, approvedResult, lastResult, versionsResult] = await Promise.all([
    admin
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "specialty_tag"),
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .eq("decision", "approved"),
    admin
      .from("lab_decisions")
      .select("decided_at")
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .order("decided_at", { ascending: false })
      .limit(1),
    admin
      .from("model_versions")
      .select("version")
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .eq("active", true)
      .limit(1),
  ]);

  const activeVersionName = (versionsResult.data?.[0]?.version as string | null) ?? null;

  const noVersion = Promise.resolve({ count: 0 as number | null, error: null });

  const [activeVersionCountResult, fpResult, fnResult] = await Promise.all([
    activeVersionName
      ? admin
          .from("lab_decisions")
          .select("*", { count: "exact", head: true })
          .eq("specialty", specialty)
          .eq("module", "specialty_tag")
          .eq("model_version", activeVersionName)
      : noVersion,
    activeVersionName
      ? admin
          .from("lab_decisions")
          .select("*", { count: "exact", head: true })
          .eq("specialty", specialty)
          .eq("module", "specialty_tag")
          .eq("model_version", activeVersionName)
          .eq("ai_decision", "approved")
          .eq("decision", "rejected")
      : noVersion,
    activeVersionName
      ? admin
          .from("lab_decisions")
          .select("*", { count: "exact", head: true })
          .eq("specialty", specialty)
          .eq("module", "specialty_tag")
          .eq("model_version", activeVersionName)
          .eq("ai_decision", "rejected")
          .eq("decision", "approved")
      : noVersion,
  ]);

  const queueCount          = queueResult.count ?? 0;
  const totalDecisions      = totalResult.count ?? 0;
  const lastDecisionAt      = lastResult.data?.[0]?.decided_at ?? null;
  const activeVersionCount  = activeVersionCountResult.count ?? 0;
  const disagreementsCount  = (fpResult.count ?? 0) + (fnResult.count ?? 0);

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back link */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Admin
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#E83B2A",
            textTransform: "uppercase" as const,
            fontWeight: 700,
            marginBottom: "6px",
          }}>
            The Lab
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            The Lab · {specialtyLabel}
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Mærk artikler og træn AI-modellerne til dit speciale
          </p>
        </div>

        {/* Active module card */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
          marginBottom: "16px",
        }}>
          <div style={{
            background: "#EEF2F7",
            borderBottom: "1px solid #dde3ed",
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{
              fontSize: "11px",
              letterSpacing: "0.08em",
              color: "#E83B2A",
              textTransform: "uppercase" as const,
              fontWeight: 700,
            }}>
              Specialty Tag Validation
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {activeVersionName && (
                <span style={{ fontSize: "11px", color: "#5a6a85", fontWeight: 600 }}>
                  {activeVersionName}
                </span>
              )}
              <span style={{
                fontSize: "11px",
                background: "#E83B2A",
                color: "#fff",
                borderRadius: "4px",
                padding: "2px 8px",
                fontWeight: 600,
              }}>
                Aktiv
              </span>
            </div>
          </div>

          <div style={{ padding: "24px" }}>
            {/* KPI grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "24px",
              marginBottom: "24px",
            }}>
              <div>
                <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                  Artikler i kø
                </div>
                <div style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: queueCount > 0 ? "#E83B2A" : "#1a1a1a",
                }}>
                  {queueCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                  Bearbejdet i alt
                </div>
                <div style={{ fontSize: "24px", fontWeight: 700 }}>{activeVersionCount}</div>
                {activeVersionCount !== totalDecisions && (
                  <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{totalDecisions} i alt</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                  Uenigheder
                </div>
                <div style={{ fontSize: "24px", fontWeight: 700, color: disagreementsCount > 0 ? "#d97706" : "#1a1a1a" }}>
                  {activeVersionCount > 0
                    ? `${Math.round((disagreementsCount / activeVersionCount) * 100)}%`
                    : "—"}
                </div>
                <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>
                  {disagreementsCount} af {activeVersionCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                  Sidst bearbejdet
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#5a6a85", paddingTop: "6px" }}>
                  {fmtDate(lastDecisionAt)}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <Link
                href={`/admin/system/layers/${specialty}/training`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  background: queueCount > 0 ? "#E83B2A" : "#1a1a1a",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {queueCount > 0
                  ? `Start session · ${queueCount} artikler klar`
                  : "Start session"}
                {" →"}
              </Link>
              <Link
                href="/admin/lab/specialty-tag/dashboard"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "8px",
                  padding: "10px 16px",
                  background: "transparent",
                  border: "1px solid #dde3ed",
                  color: "#5a6a85",
                  fontSize: "13px",
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Se performance →
              </Link>
              <Link
                href="/admin/lab/specialty-tag/evaluation"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "8px",
                  padding: "10px 16px",
                  background: "transparent",
                  border: "1px solid #dde3ed",
                  color: "#5a6a85",
                  fontSize: "13px",
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Prompt evaluation →
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
