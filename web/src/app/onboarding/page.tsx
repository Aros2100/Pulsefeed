import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import OnboardingFlow from "./OnboardingFlow";
import { getSubspecialties } from "@/lib/lab/classification-options";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (user.user_metadata?.onboarding_completed === true) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("name, first_name, last_name")
    .eq("id", user.id)
    .single();

  const initialAuthorQuery = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ") || profile?.name || "";
  const subspecialties = await getSubspecialties(ACTIVE_SPECIALTY);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fa",
        display: "flex",
        justifyContent: "center",
        paddingTop: "60px",
        paddingBottom: "60px",
        paddingLeft: "16px",
        paddingRight: "16px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "560px" }}>
        <div style={{ marginBottom: "28px", textAlign: "center" }}>
          <Image
            src="/logo-horizontal.svg"
            alt="PulseFeed"
            width={194}
            height={48}
            style={{ margin: "0 auto", height: "40px", width: "auto" }}
            priority
          />
        </div>
        <OnboardingFlow initialAuthorQuery={initialAuthorQuery} subspecialties={subspecialties} />
      </div>
    </div>
  );
}
