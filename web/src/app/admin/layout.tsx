import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  console.log("[admin/layout] user:", user
    ? {
        id:           user.id,
        email:        user.email,
        app_metadata: user.app_metadata,
        user_metadata: user.user_metadata,
      }
    : null
  );

  if (!user) redirect("/login");

  console.log("[admin/layout] app_metadata.role:", user.app_metadata?.role, "→ isAdmin:", user.app_metadata?.role === "admin");

  if (user.app_metadata?.role !== "admin") redirect("/articles");

  return (
    <>
      <Header />
      {children}
    </>
  );
}
