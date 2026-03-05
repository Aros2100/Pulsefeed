import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SPECIALTIES } from "@/lib/auth/specialties";
import Header from "@/components/Header";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
      {children}
    </div>
  );
}

function CardHeader({ label }: { label: string }) {
  return (
    <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </div>
      <span style={{ fontSize: "12px", color: "#b0bac8", cursor: "not-allowed" }}>
        Coming soon
      </span>
    </div>
  );
}

function InfoRow({ label, value, first }: { label: string; value: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ padding: "16px 24px", borderTop: first ? undefined : "1px solid #f0f0f0" }}>
      <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>{value}</div>
    </div>
  );
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("name, email, specialty_slugs, author_id")
    .eq("id", user.id)
    .single();

  const specialtySlugs: string[] = profile?.specialty_slugs ?? [];

  const card: React.CSSProperties = {
    background: "#fff",
    borderRadius: "10px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
    overflow: "hidden",
    marginBottom: "28px",
  };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <Header />

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Page title */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "26px", fontWeight: 700 }}>My Profile</div>
          <div style={{ fontSize: "14px", color: "#888", marginTop: "4px" }}>Manage your account and preferences</div>
        </div>

        {/* Section 1 — Account */}
        <SectionLabel>Account</SectionLabel>
        <div style={card}>
          <CardHeader label="Personal information" />
          <InfoRow first label="Name"  value={profile?.name  ?? "—"} />
          <InfoRow       label="Email" value={user.email     ?? "—"} />
        </div>

        {/* Section 2 — Specialty */}
        <SectionLabel>Specialty</SectionLabel>
        <div style={card}>
          <CardHeader label="Your specialties" />
          <div style={{ padding: "16px 24px" }}>
            {specialtySlugs.length === 0 ? (
              <span style={{ fontSize: "14px", color: "#888" }}>No specialty configured</span>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {specialtySlugs.map((slug) => {
                  const label = SPECIALTIES.find((s) => s.slug === slug)?.label ?? slug;
                  return (
                    <span key={slug} style={{ background: "#EEF2F7", borderRadius: "6px", padding: "4px 10px", fontSize: "12px", fontWeight: 600, color: "#1a1a1a" }}>
                      {label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Section 3 — Author Profile */}
        <SectionLabel>Author Profile</SectionLabel>
        {profile?.author_id ? (
          <div style={{ ...card, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: "999px", padding: "4px 12px", fontSize: "12px", fontWeight: 700 }}>
                Linked ✓
              </span>
              <span style={{ fontSize: "14px", color: "#1a1a1a" }}>Author profile connected</span>
            </div>
            <Link href="/profile/link-author" style={{ fontSize: "13px", color: "#4f46e5", fontWeight: 600, textDecoration: "none" }}>
              Change →
            </Link>
          </div>
        ) : (
          <div style={{ border: "1.5px dashed #c7d2e0", borderRadius: "10px", padding: "14px 20px", background: "#fafbfd", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "13px", color: "#5a6a85" }}>Are you a published author?</div>
            <Link href="/profile/link-author" style={{ fontSize: "13px", color: "#4f46e5", fontWeight: 600, textDecoration: "none" }}>
              Link your profile →
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
