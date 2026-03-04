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

  const [queueResult, decisionsResult] = await Promise.all([
    admin
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("lab_decisions")
      .select("decision, decided_at")
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .order("decided_at", { ascending: false }),
  ]);

  const decisions = decisionsResult.data ?? [];
  const queueCount = queueResult.count ?? 0;
  const totalDecisions = decisions.length;
  const approvedCount = decisions.filter((d) => d.decision === "approved").length;
  const approvalRate = totalDecisions > 0 ? Math.round((approvedCount / totalDecisions) * 100) : null;
  const lastDecisionAt = decisions.length > 0 ? decisions[0].decided_at : null;

  const futureModules = [
    { title: "Citation Quality Check", description: "Flag artikler med mistænkelige citatmønstre" },
    { title: "Duplicate Detection", description: "Mærk næsten-duplikater til sletning" },
    { title: "Abstract Grading", description: "Bedøm abstract-kvalitet til nyhedsbrev" },
  ];

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
                <div style={{ fontSize: "24px", fontWeight: 700 }}>{totalDecisions}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                  Godkendelsesrate
                </div>
                <div style={{ fontSize: "24px", fontWeight: 700 }}>
                  {approvalRate != null ? `${approvalRate}%` : "—"}
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
            </div>
          </div>
        </div>

        {/* Future modules */}
        <div style={{
          fontSize: "11px",
          letterSpacing: "0.08em",
          color: "#888",
          textTransform: "uppercase" as const,
          fontWeight: 700,
          marginBottom: "12px",
          marginTop: "28px",
        }}>
          Kommende moduler
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          {futureModules.map((m) => (
            <div key={m.title} style={{
              background: "#fff",
              borderRadius: "10px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
              padding: "20px",
              opacity: 0.5,
            }}>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>{m.title}</div>
              <div style={{ fontSize: "12px", color: "#888", marginBottom: "16px" }}>{m.description}</div>
              <span style={{
                fontSize: "11px",
                background: "#f5f7fa",
                border: "1px solid #dde3ed",
                borderRadius: "4px",
                padding: "3px 8px",
                color: "#888",
                fontWeight: 600,
              }}>
                Kommer snart
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
