import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY } from "@/lib/lab/value-scoring/craft-config";
import ValidationLandingClient from "./ValidationLandingClient";

export default async function ValidationIndexPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Resolve module
  const { data: mod } = await admin
    .from('lab_modules')
    .select('id')
    .eq('module_type', CRAFT_MODULE_KEY.module_type)
    .eq('parameter',   CRAFT_MODULE_KEY.parameter)
    .eq('specialty',   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  const moduleId = mod ? (mod as { id: string }).id : null;

  // Pool stats
  let poolCount = 0;
  if (moduleId) {
    const { count } = await admin
      .from('lab_value_validation_articles')
      .select('id', { count: 'exact', head: true })
      .eq('module_id', moduleId);
    poolCount = count ?? 0;
  }

  // Fully-scored prompts for the dropdown — newest first, only those with all articles scored
  type PromptRow = { id: string; version: number; created_at: string };
  let promptOptions: { id: string; version: number }[] = [];
  if (moduleId) {
    // Article count for this module (need it to identify fully-scored prompts)
    const { count: artCount } = await admin
      .from('lab_value_articles')
      .select('id', { count: 'exact', head: true })
      .eq('module_id', moduleId);
    const articleCount = artCount ?? 0;

    const { data: allPrompts } = await admin
      .from('lab_value_prompts')
      .select('id, version, created_at')
      .eq('module_id', moduleId)
      .order('created_at', { ascending: false });
    const ps = ((allPrompts ?? []) as PromptRow[]);

    // Keep only prompts that have a craft_score for every article (fully scored)
    const scored: { id: string; version: number }[] = [];
    for (const p of ps) {
      const { count } = await admin
        .from('lab_value_article_scores')
        .select('article_id', { count: 'exact', head: true })
        .eq('prompt_id', p.id)
        .not('craft_score', 'is', null);
      if (count && articleCount > 0 && count >= articleCount) {
        scored.push({ id: p.id, version: p.version });
      }
    }
    promptOptions = scored;
  }

  // All runs for this module (needed for aggregation + active-run lookup)
  type RunRow = { id: string; prompt_id: string; status: string; created_at: string };
  let runs: RunRow[] = [];
  if (moduleId) {
    const { data: runRows } = await admin
      .from('lab_value_validation_runs')
      .select('id, prompt_id, status, created_at')
      .eq('module_id', moduleId)
      .order('created_at', { ascending: true }) // asc so first non-complete run is easy to find
      .range(0, 9999);
    runs = ((runRows ?? []) as RunRow[]);
  }

  // Prompt version map — seed from promptOptions, then fill gaps from run prompts
  const promptVersionMap = new Map<string, number>();
  for (const o of promptOptions) promptVersionMap.set(o.id, o.version);
  const unmappedPromptIds = runs.filter(r => !promptVersionMap.has(r.prompt_id)).map(r => r.prompt_id);
  if (unmappedPromptIds.length > 0) {
    const { data: pvRows } = await admin
      .from('lab_value_prompts')
      .select('id, version')
      .in('id', [...new Set(unmappedPromptIds)]);
    type PVRow = { id: string; version: number };
    for (const pv of ((pvRows ?? []) as PVRow[])) promptVersionMap.set(pv.id, pv.version);
  }

  // Aggregate validation items per prompt
  type ItemRow = { run_id: string; outcome: string | null; craft_score: number | string | null; validated_at: string | null };
  const runIds = runs.map(r => r.id);
  let allItems: ItemRow[] = [];
  if (runIds.length > 0) {
    const { data: itemRows } = await admin
      .from('lab_value_validation_items')
      .select('run_id, outcome, craft_score, validated_at')
      .in('run_id', runIds)
      .range(0, 9999);
    allItems = ((itemRows ?? []) as ItemRow[]);
  }

  const runPromptMap = new Map<string, string>(runs.map(r => [r.id, r.prompt_id]));

  type PromptStats = {
    promptId: string; version: number;
    validated: number; agree: number; overscored: number; underscored: number; mixed: number;
    pending: number; oldestActiveRunId: string | null;
  };
  const statsByPrompt = new Map<string, PromptStats>();

  for (const item of allItems) {
    const promptId = runPromptMap.get(item.run_id);
    if (!promptId) continue;
    if (!statsByPrompt.has(promptId)) {
      statsByPrompt.set(promptId, { promptId, version: promptVersionMap.get(promptId) ?? 0, validated: 0, agree: 0, overscored: 0, underscored: 0, mixed: 0, pending: 0, oldestActiveRunId: null });
    }
    const s = statsByPrompt.get(promptId)!;
    if (item.validated_at !== null) {
      s.validated++;
      if (item.outcome === 'agree')       s.agree++;
      else if (item.outcome === 'overscored')  s.overscored++;
      else if (item.outcome === 'underscored') s.underscored++;
      else if (item.outcome === 'mixed')       s.mixed++;
    } else if (item.craft_score !== null) {
      s.pending++;
    }
  }
  // Oldest run (asc-sorted) that has at least one scored-but-unvalidated item
  const runsWithPending = new Set(
    allItems
      .filter(i => i.craft_score !== null && i.validated_at === null)
      .map(i => i.run_id)
  );
  for (const run of runs) {
    if (runsWithPending.has(run.id)) {
      const s = statsByPrompt.get(run.prompt_id);
      if (s && s.oldestActiveRunId === null) s.oldestActiveRunId = run.id;
    }
  }

  const promptStatsList = [...statsByPrompt.values()]
    .filter(s => s.validated > 0)
    .sort((a, b) => b.version - a.version);

  const thStyle: React.CSSProperties = {
    textAlign: 'left', fontSize: '11px', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    color: '#5a6a85', padding: '10px 16px',
  };
  const tdStyle: React.CSSProperties = { fontSize: '13px', padding: '10px 16px' };

  return (
    <div style={{ fontFamily: 'var(--font-inter), Inter, sans-serif', background: '#f5f7fa', color: '#1a1a1a', minHeight: '100vh' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#E83B2A', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>
            The Lab · Value Scoring · Craft
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px' }}>Validation</h1>
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>
            Test prompt versions against real production articles not in the training pool. Compare AI scores against trained anchor articles.
          </p>
        </div>

        {/* Pool + import + start run */}
        <ValidationLandingClient
          poolCount={poolCount}
          promptOptions={promptOptions}
        />

        {/* Validation results per prompt */}
        {promptStatsList.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)', overflow: 'hidden', marginTop: '20px' }}>
            <div style={{ background: '#EEF2F7', borderBottom: '1px solid #dde3ed', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#5a6a85', textTransform: 'uppercase', fontWeight: 700 }}>
                Validation Results
              </span>
              <Link href="/admin/lab/value-scoring/craft/validation/disagreements" style={{ fontSize: '12px', color: '#E83B2A', textDecoration: 'none', fontWeight: 600 }}>
                View all disagreements →
              </Link>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafbfc' }}>
                  <th style={thStyle}>Prompt</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Validated</th>
                  <th style={{ ...thStyle, textAlign: 'right', color: '#059669' }}>Agree</th>
                  <th style={{ ...thStyle, textAlign: 'right', color: '#059669' }}>Agree %</th>
                  <th style={{ ...thStyle, textAlign: 'right', color: '#b91c1c' }}>Overscored</th>
                  <th style={{ ...thStyle, textAlign: 'right', color: '#2563eb' }}>Underscored</th>
                  <th style={{ ...thStyle, textAlign: 'right', color: '#92400e' }}>Mixed</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Pending</th>
                  <th style={{ ...thStyle, width: '1px' }}></th>
                </tr>
              </thead>
              <tbody>
                {promptStatsList.map(s => (
                  <tr key={s.promptId} style={{ borderTop: '1px solid #f5f5f5' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>v{s.version}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.validated}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#059669', fontWeight: s.agree > 0 ? 600 : 400 }}>{s.agree}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#059669', fontWeight: 600 }}>
                      {s.validated > 0 ? `${Math.round(s.agree / s.validated * 100)}%` : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#b91c1c', fontWeight: s.overscored > 0 ? 600 : 400 }}>{s.overscored}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#2563eb', fontWeight: s.underscored > 0 ? 600 : 400 }}>{s.underscored}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#92400e', fontWeight: s.mixed > 0 ? 600 : 400 }}>{s.mixed}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {s.pending > 0 && s.oldestActiveRunId ? (
                        <Link href={`/admin/lab/value-scoring/craft/validation/run/${s.oldestActiveRunId}`} style={{ color: '#E83B2A', textDecoration: 'none', fontWeight: 600 }}>
                          {s.pending}
                        </Link>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>{s.pending > 0 ? s.pending : '—'}</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link href={`/admin/lab/value-scoring/craft/validation/disagreements?promptId=${s.promptId}`} style={{ fontSize: '12px', color: '#E83B2A', textDecoration: 'none', fontWeight: 600 }}>
                        View disagreements →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '24px' }}>
          <Link href="/admin/lab/value-scoring/craft" style={{ fontSize: '12px', color: '#94a3b8', textDecoration: 'none' }}>
            ← Back to module
          </Link>
        </div>
      </div>
    </div>
  );
}
