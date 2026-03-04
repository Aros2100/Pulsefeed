import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (user.app_metadata?.role !== "admin") redirect("/articles");

  return (
    <>
      <Header />
      {children}
    </>
  );
}
