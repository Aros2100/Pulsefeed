import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";

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

  const admin = createAdminClient();

  const [specQueueResult, clsQueueResult] = await Promise.all([
    admin.rpc("count_scored_not_validated" as never, { p_specialty: specialty } as never),
    admin.rpc("count_classification_not_validated" as never, { p_specialty: specialty } as never),
  ]);

  const specQueueCount = (specQueueResult.data as number | null) ?? 0;
  const clsQueueCount = (clsQueueResult.data as number | null) ?? 0;

  const modules = [
    {
      title: "Speciale-validering",
      description: "Validér AI-tagging af artikler til dit speciale og træn modellen",
      queue: specQueueCount,
      href: "/admin/lab/specialty-tag",
      color: "#E83B2A",
    },
    {
      title: "Klassificering",
      description: "Klassificér artikler i sub-specialer og træn klassificeringsmodellen",
      queue: clsQueueCount,
      href: "/admin/lab/classification",
      color: "#7c3aed",
      badge: "Ny",
    },
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
            Moduler
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Vælg et modul for at validere og træne AI-modellerne
          </p>
        </div>

        {/* Module cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {modules.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div style={{
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #e5e7eb",
                padding: "24px 28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transition: "box-shadow 0.15s, border-color 0.15s",
                cursor: "pointer",
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "16px", fontWeight: 600 }}>{m.title}</span>
                    {m.badge && (
                      <span style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "#fff",
                        background: m.color,
                        borderRadius: "4px",
                        padding: "2px 6px",
                        letterSpacing: "0.03em",
                      }}>
                        {m.badge}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
                    {m.description}
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
                  {m.queue > 0 && (
                    <span style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: m.color,
                      background: `${m.color}12`,
                      borderRadius: "6px",
                      padding: "4px 10px",
                    }}>
                      {m.queue} i kø
                    </span>
                  )}
                  <span style={{ fontSize: "18px", color: "#bbb" }}>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
