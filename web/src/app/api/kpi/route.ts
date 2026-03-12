import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") || "week";
  const subspecialty = req.nextUrl.searchParams.get("subspecialty") || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data, error } = await admin.rpc("get_kpi_overview", {
    p_period: period,
    p_subspecialty: subspecialty || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
