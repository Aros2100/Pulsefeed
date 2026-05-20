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

  // Scored prompts for the dropdown
  type PromptRow = { id: string; version: number; direction_id: string | null };
  let promptOptions: { id: string; version: number }[] = [];
  if (moduleId) {
    // Get prompts that have at least one craft_score
    const { data: scoredPrompts } = await admin
      .from('lab_value_prompts')
      .select('id, version, direction_id')
      .eq('module_id', moduleId)
      .order('version', { ascending: true });
    const ps = ((scoredPrompts ?? []) as PromptRow[]);

    // Filter to only those with scores
    const scored: { id: string; version: number }[] = [];
    for (const p of ps) {
      const { count } = await admin
        .from('lab_value_article_scores')
        .select('article_id', { count: 'exact', head: true })
        .eq('prompt_id', p.id)
        .not('craft_score', 'is', null);
      if (count && count > 0) scored.push({ id: p.id, version: p.version });
    }
    promptOptions = scored;
  }

  // Runs history
  type RunRow = {
    id: string;
    prompt_id: string;
    n_articles: number;
    status: string;
    created_at: string;
    completed_at: string | null;
  };
  let runs: RunRow[] = [];
  if (moduleId) {
    const { data: runRows } = await admin
      .from('lab_value_validation_runs')
      .select('id, prompt_id, n_articles, status, created_at, completed_at')
      .eq('module_id', moduleId)
      .order('created_at', { ascending: false })
      .range(0, 49);
    runs = ((runRows ?? []) as RunRow[]);
  }

  // Get prompt versions for run history display
  const promptVersionMap = new Map<string, number>();
  for (const o of promptOptions) promptVersionMap.set(o.id, o.version);
  // Also fetch versions for runs that use prompts not in the scored list
  const unmappedPromptIds = runs.filter(r => !promptVersionMap.has(r.prompt_id)).map(r => r.prompt_id);
  if (unmappedPromptIds.length > 0) {
    const { data: pvRows } = await admin
      .from('lab_value_prompts')
      .select('id, version')
      .in('id', [...new Set(unmappedPromptIds)]);
    type PVRow = { id: string; version: number };
    for (const pv of ((pvRows ?? []) as PVRow[])) promptVersionMap.set(pv.id, pv.version);
  }

  // Status badge helpers
  function statusColor(status: string): string {
    if (status === 'complete')   return '#059669';
    if (status === 'validating') return '#2563eb';
    if (status === 'scoring')    return '#92400e';
    return '#94a3b8';
  }

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

        {/* Runs history */}
        {runs.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)', overflow: 'hidden', marginTop: '20px' }}>
            <div style={{ background: '#EEF2F7', borderBottom: '1px solid #dde3ed', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#5a6a85', textTransform: 'uppercase', fontWeight: 700 }}>
                Run History
              </span>
              <Link href="/admin/lab/value-scoring/craft/validation/disagreements" style={{ fontSize: '12px', color: '#E83B2A', textDecoration: 'none', fontWeight: 600 }}>
                View all disagreements →
              </Link>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafbfc' }}>
                  <th style={thStyle}>Run</th>
                  <th style={thStyle}>Prompt</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Articles</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <tr key={run.id} style={{ borderTop: '1px solid #f5f5f5' }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#5a6a85', fontVariantNumeric: 'tabular-nums' }}>
                      #{runs.length - i}
                    </td>
                    <td style={tdStyle}>
                      v{promptVersionMap.get(run.prompt_id) ?? '?'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {run.n_articles}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: statusColor(run.status), textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {run.status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: '#5a6a85', fontSize: '12px' }}>
                      {new Date(run.created_at).toLocaleDateString('en-CA')}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <Link
                        href={`/admin/lab/value-scoring/craft/validation/run/${run.id}`}
                        style={{ fontSize: '12px', color: '#E83B2A', textDecoration: 'none', fontWeight: 600 }}
                      >
                        Open →
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
