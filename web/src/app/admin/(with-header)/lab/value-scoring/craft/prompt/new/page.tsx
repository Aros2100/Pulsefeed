import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY, MIN_PAIRS_FOR_PROMPT } from "@/lib/lab/value-scoring/craft-config";
import { getDecidedPairCount, getPromptVersions } from "@/lib/lab/value-scoring/prompt-versions";
import NewVersionClient from "./NewVersionClient";

interface PageProps {
  searchParams: Promise<{ from?: string }>;
}

export default async function NewPromptVersionPage({ searchParams }: PageProps) {
  const { from } = await searchParams;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: mod } = await admin
    .from("lab_modules")
    .select("id")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  if (!mod) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ background: "#fff", borderRadius: "10px", padding: "32px", textAlign: "center", fontSize: "14px", color: "#5a6a85" }}>
            Module not found.
          </div>
        </div>
      </div>
    );
  }

  const moduleId = mod.id as string;
  const decidedPairs = await getDecidedPairCount(admin, moduleId);

  if (decidedPairs < MIN_PAIRS_FOR_PROMPT) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ background: "#fff8e1", border: "1px solid #fde68a", borderRadius: "8px", padding: "16px 20px", fontSize: "13px", color: "#92400e" }}>
            Finish more pairwise comparisons before working on the prompt — {decidedPairs} / {MIN_PAIRS_FOR_PROMPT} decided.
          </div>
          <Link href="/admin/lab/value-scoring/craft/prompt" style={{ display: "inline-block", marginTop: "14px", fontSize: "13px", color: "#E83B2A" }}>
            ← Back to prompt list
          </Link>
        </div>
      </div>
    );
  }

  // Determine starting text. If `from` is provided, prefill from that version;
  // otherwise default to the latest existing version (if any), else blank.
  let startingText = "";
  let startedFromVersion: number | null = null;

  if (from) {
    const { data: src } = await admin
      .from("lab_value_prompts")
      .select("version, prompt_text, module_id")
      .eq("id", from)
      .maybeSingle();
    if (src && (src as { module_id: string }).module_id === moduleId) {
      startingText = (src as { prompt_text: string }).prompt_text;
      startedFromVersion = (src as { version: number }).version;
    }
  } else {
    const versions = await getPromptVersions(admin, moduleId);
    if (versions.length > 0) {
      const latest = versions[0];
      const { data: src } = await admin
        .from("lab_value_prompts")
        .select("prompt_text, version")
        .eq("id", latest.id)
        .maybeSingle();
      if (src) {
        startingText = (src as { prompt_text: string }).prompt_text;
        startedFromVersion = (src as { version: number }).version;
      }
    }
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            The Lab · Value Scoring · Craft · Prompt
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>New version</h1>
          <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
            Write a new prompt version. Once scored, the version becomes read-only.
          </p>
        </div>

        <NewVersionClient startingText={startingText} startedFromVersion={startedFromVersion} />
      </div>
    </div>
  );
}
