import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AdminResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Verifies that the current request belongs to an authenticated admin user.
 * Use in API route handlers: `const auth = await requireAdmin(); if (!auth.ok) return auth.response;`
 */
export async function requireAdmin(): Promise<AdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  if (user.app_metadata?.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: user.id };
}
