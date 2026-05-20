import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import ValidationRunClient from "./ValidationRunClient";

interface PageProps {
  params: Promise<{ runId: string }>;
}

export default async function ValidationRunPage({ params }: PageProps) {
  const { runId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: run } = await admin
    .from('lab_value_validation_runs')
    .select('id, status, n_articles, prompt_id')
    .eq('id', runId)
    .maybeSingle();

  if (!run) notFound();

  type Run = { id: string; status: string; n_articles: number; prompt_id: string };
  const r = run as Run;

  return (
    <ValidationRunClient
      runId={r.id}
      runStatus={r.status}
      nArticles={r.n_articles}
    />
  );
}
