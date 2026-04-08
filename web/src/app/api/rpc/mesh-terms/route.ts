export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ terms: [] }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const subspecialty = params.get("subspecialty");
  const specialty = params.get("specialty") ?? ACTIVE_SPECIALTY;
  const clinicalOnly = params.get("clinical_only") !== "false";
  const yearRange = params.get("year_range") ?? "2";

  if (!subspecialty) {
    return NextResponse.json({ terms: [] }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "get_mesh_terms_for_subspecialty",
    {
      p_specialty: specialty,
      p_subspecialty: subspecialty,
      p_clinical_only: clinicalOnly,
      p_year_range: yearRange,
    },
  );

  if (error) return NextResponse.json({ terms: [] }, { status: 500 });

  return NextResponse.json({ terms: data ?? [] });
}
