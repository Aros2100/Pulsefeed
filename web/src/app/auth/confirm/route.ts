import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as EmailOtpType,
    });

    if (!error) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  return NextResponse.redirect(
    new URL("/sign-in?error=confirmation_failed", request.url)
  );
}
