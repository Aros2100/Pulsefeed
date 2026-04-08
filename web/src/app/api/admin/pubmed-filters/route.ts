import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  specialty: z
    .string()
    .refine((v) => v === ACTIVE_SPECIALTY, {
      message: "Invalid specialty",
    }),
  query_string: z.string().min(1, "Query is required"),
  journal_list: z.array(z.string()).optional(),
  max_results: z.number().int().min(1).max(10000).default(100),
  active: z.boolean().default(true),
  circle: z.number().int().refine((v) => [1, 2].includes(v)).default(1),
});

const updateSchema = z.object({
  id: z.string().uuid("Invalid filter ID"),
  name: z.string().min(1).max(100).optional(),
  specialty: z
    .string()
    .refine((v) => v === ACTIVE_SPECIALTY)
    .optional(),
  query_string: z.string().min(1).optional(),
  journal_list: z.array(z.string()).optional(),
  max_results: z.number().int().min(1).max(10000).optional(),
  active: z.boolean().optional(),
  circle: z.number().int().refine((v) => [1, 2].includes(v)).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty");
  const circle = searchParams.get("circle");

  const admin = createAdminClient();
  let query = admin
    .from("pubmed_filters")
    .select("*")
    .order("created_at", { ascending: true });

  if (specialty) query = query.eq("specialty", specialty);
  if (circle) query = query.eq("circle", parseInt(circle));

  const { data: filters, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, filters: filters ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const result = createSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, error: result.error.issues[0].message },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: filter, error } = await admin
    .from("pubmed_filters")
    .insert(result.data)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, filter }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const result = updateSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, error: result.error.issues[0].message },
      { status: 400 }
    );
  }

  const { id, ...updates } = result.data;

  const admin = createAdminClient();
  const { data: filter, error } = await admin
    .from("pubmed_filters")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, filter });
}
