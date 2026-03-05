import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SPECIALTIES } from "@/lib/auth/specialties";
import Header from "@/components/Header";
import ProfileAvatarUpload from "./ProfileAvatarUpload";
import ProfileEditClient from "./ProfileEditClient";
import ProfilePrivacyClient from "./ProfilePrivacyClient";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
      {children}
    </div>
  );
}

function CardHeader({ label }: { label: string }) {
  return (
    <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#fff", borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden", marginBottom: "28px",
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("name, specialty_slugs, author_id, avatar_url, is_public, email_notifications")
    .eq("id", user.id)
    .single();

  const specialtySlugs: string[] = profile?.specialty_slugs ?? [];
  const specialtyLabels = Object.fromEntries(SPECIALTIES.map((s) => [s.slug, s.label as string]));

  let articleCount = 0;
  if (profile?.author_id) {
    const { count } = await supabase
      .from("article_authors")
      .select("*", { count: "exact", head: true })
      .eq("author_id", profile.author_id);
    articleCount = count ?? 0;
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <Header />

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "26px", fontWeight: 700 }}>My Profile</div>
          <div style={{ fontSize: "14px", color: "#888", marginTop: "4px" }}>Manage your account and preferences</div>
        </div>

        <ProfileAvatarUpload
          avatarUrl={profile?.avatar_url ?? null}
          displayName={profile?.name ?? user.email ?? "?"}
        />

        <SectionLabel>Account</SectionLabel>
        <div style={card}>
          <CardHeader label="Personal information" />
          <div style={{ padding: "4px 0 0" }}>
            <div style={{ padding: "12px 24px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ fontSize: "12px", color: "#888", marginBottom: "2px" }}>Email</div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>{user.email ?? "—"}</div>
            </div>
            <ProfileEditClient
              initialName={profile?.name ?? ""}
              initialSpecialtySlugs={specialtySlugs}
            />
          </div>
        </div>

        <SectionLabel>Privacy & Notifications</SectionLabel>
        <div style={card}>
          <CardHeader label="Profile visibility" />
          <ProfilePrivacyClient
            initialIsPublic={profile?.is_public ?? false}
            initialEmailNotifications={profile?.email_notifications ?? true}
            name={profile?.name ?? ""}
            specialtySlugs={specialtySlugs}
            articleCount={articleCount}
            specialtyLabels={specialtyLabels}
          />
        </div>

        <SectionLabel>Author Profile</SectionLabel>
        {profile?.author_id ? (
          <div style={{ ...card, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: "999px", padding: "4px 12px", fontSize: "12px", fontWeight: 700 }}>
                Linked ✓
              </span>
              <span style={{ fontSize: "14px", color: "#1a1a1a" }}>Author profile connected · {articleCount} publications</span>
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
