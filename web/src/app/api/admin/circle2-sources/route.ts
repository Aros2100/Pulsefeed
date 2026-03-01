import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";

const SOURCE_TYPES = ["mesh", "text", "author", "institution", "citation", "doi", "keyword", "affiliation"] as const;

const createSchema = z.object({
  specialty: z
    .string()
    .refine((v) => (SPECIALTY_SLUGS as readonly string[]).includes(v), {
      message: "Invalid specialty",
    }),
  type: z.enum(SOURCE_TYPES),
  value: z.string().min(1, "Value is required"),
  description: z.string().optional(),
  max_results: z.number().int().min(1).max(10000).optional(),
  active: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid("Invalid source ID"),
  specialty: z
    .string()
    .refine((v) => (SPECIALTY_SLUGS as readonly string[]).includes(v))
    .optional(),
  type: z.enum(SOURCE_TYPES).optional(),
  value: z.string().min(1).optional(),
  description: z.string().optional(),
  max_results: z.number().int().min(1).max(10000).optional(),
  active: z.boolean().optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid("Invalid source ID"),
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty");

  const admin = createAdminClient();
  let query = admin
    .from("circle_2_sources")
    .select("*")
    .order("created_at", { ascending: true });

  if (specialty) query = query.eq("specialty", specialty);

  const { data: sources, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sources: sources ?? [] });
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
  const { data: source, error } = await admin
    .from("circle_2_sources")
    .insert(result.data)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source }, { status: 201 });
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
  const { data: source, error } = await admin
    .from("circle_2_sources")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source });
}

const bulkAffiliationSchema = z.object({
  specialty: z
    .string()
    .refine((v) => (SPECIALTY_SLUGS as readonly string[]).includes(v), {
      message: "Invalid specialty",
    }),
  terms: z.array(z.string().min(1)).max(500),
  max_results: z.number().int().min(1).max(10000).optional(),
});

/** Bulk-replace all affiliation sources for a specialty. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const result = bulkAffiliationSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, error: result.error.issues[0].message },
      { status: 400 }
    );
  }

  const { specialty, terms, max_results } = result.data;
  const admin = createAdminClient();

  const { error: deleteErr } = await admin
    .from("circle_2_sources")
    .delete()
    .eq("specialty", specialty)
    .eq("type", "affiliation");

  if (deleteErr) {
    return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 500 });
  }

  if (terms.length > 0) {
    const rows = terms.map((t) => ({
      specialty,
      type: "affiliation" as const,
      value: t.trim(),
      active: true,
      ...(max_results !== undefined ? { max_results } : {}),
    }));
    const { error: insertErr } = await admin.from("circle_2_sources").insert(rows);
    if (insertErr) {
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const result = deleteSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, error: result.error.issues[0].message },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("circle_2_sources")
    .delete()
    .eq("id", result.data.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
