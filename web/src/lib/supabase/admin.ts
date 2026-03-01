import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Kun til server-side brug (route handlers, server actions).
// Bruger service_role-nøglen — omgår RLS.
// Eksponér ALDRIG denne klient i browser-kode.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase admin-klient kræver NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
