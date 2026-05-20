import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY } from "@/lib/lab/value-scoring/craft-config";
import SuggestButton from "./SuggestButton";

interface PageProps {
  searchParams: Promise<{ outcome?: string; promptId?: string; articleType?: string }>;
}

export default async function ValidationDisagreementsPage({ searchParams }: PageProps) {
  const sp = await searchParams;

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

  // Load all validation runs for this module
  type RunRow = { id: string; prompt_id: string; status: string };
  let runs: RunRow[] = [];
  if (moduleId) {
    const { data: runRows } = await admin
      .from('lab_value_validation_runs')
      .select('id, prompt_id, status')
      .eq('module_id', moduleId)
      .range(0, 9999);
    runs = ((runRows ?? []) as RunRow[]);
  }
  const runIds = runs.map(r => r.id);

  // Prompt versions for filter UI
  const promptVersionMap = new Map<string, number>();
  const promptIds = [...new Set(runs.map(r => r.prompt_id))];
  if (promptIds.length > 0) {
    const { data: pvRows } = await admin
      .from('lab_value_prompts')
      .select('id, version')
      .in('id', promptIds);
    type PVRow = { id: string; version: number };
    for (const pv of ((pvRows ?? []) as PVRow[])) promptVersionMap.set(pv.id, pv.version);
  }

  // Build run→promptId map
  const runPromptMap = new Map<string, string>(runs.map(r => [r.id, r.prompt_id]));

  // Load disagreement items
  type ItemRow = {
    id: string;
    run_id: string;
    validation_article_id: string;
    craft_score: number | string | null;
    dimensions: Record<string, { score: number | null; status: string }> | null;
    reasoning: string | null;
    outcome: string;
    choice_low: string | null;
    choice_same: string | null;
    choice_high: string | null;
    anchor_low_id: string | null;
    anchor_same_id: string | null;
    anchor_high_id: string | null;
  };

  let items: ItemRow[] = [];
  if (runIds.length > 0) {
    let q = admin
      .from('lab_value_validation_items')
      .select('id, run_id, validation_article_id, craft_score, dimensions, reasoning, outcome, choice_low, choice_same, choice_high, anchor_low_id, anchor_same_id, anchor_high_id')
      .in('run_id', runIds)
      .not('outcome', 'is', null)
      .neq('outcome', 'agree');

    if (sp.outcome) q = q.eq('outcome', sp.outcome);
    const { data: itemRows } = await q.range(0, 999);
    items = ((itemRows ?? []) as ItemRow[]);
  }

  // Filter by promptId
  if (sp.promptId) {
    const promptRunIds = new Set(runs.filter(r => r.prompt_id === sp.promptId).map(r => r.id));
    items = items.filter(i => promptRunIds.has(i.run_id));
  }

  // Load validation articles
  const valArtIds = [...new Set(items.map(i => i.validation_article_id))];
  type ValArt = { id: string; title: string; article_type: string | null; journal: string | null; abstract: string | null };
  const valArtMap = new Map<string, ValArt>();
  if (valArtIds.length > 0) {
    const { data: valArts } = await admin
      .from('lab_value_validation_articles')
      .select('id, title, article_type, journal, abstract')
      .in('id', valArtIds);
    for (const a of ((valArts ?? []) as ValArt[])) valArtMap.set(a.id, a);
  }

  // Filter by article_type
  if (sp.articleType) {
    items = items.filter(i => valArtMap.get(i.validation_article_id)?.article_type === sp.articleType);
  }

  // Load anchor articles
  const allAnchorIds = [...new Set(items.flatMap(i =>
    [i.anchor_low_id, i.anchor_same_id, i.anchor_high_id].filter(Boolean) as string[]
  ))];
  type AnchorArt = { id: string; title: string };
  const anchorArtMap = new Map<string, string>();
  if (allAnchorIds.length > 0) {
    const { data: anchorArts } = await admin
      .from('lab_value_articles')
      .select('id, title')
      .in('id', allAnchorIds);
    for (const a of ((anchorArts ?? []) as AnchorArt[])) anchorArtMap.set(a.id, a.title);
  }

  // Load anchor craft scores from all relevant prompts
  const anchorScoreMap = new Map<string, number | null>(); // key: `${promptId}:${articleId}`
  if (allAnchorIds.length > 0 && promptIds.length > 0) {
    const { data: scoreRows } = await admin
      .from('lab_value_article_scores')
      .select('prompt_id, article_id, craft_score')
      .in('prompt_id', promptIds)
      .in('article_id', allAnchorIds)
      .range(0, 9999);
    type ScoreRow = { prompt_id: string; article_id: string; craft_score: number | string | null };
    for (const s of ((scoreRows ?? []) as ScoreRow[])) {
      anchorScoreMap.set(`${s.prompt_id}:${s.article_id}`, s.craft_score !== null ? Number(s.craft_score) : null);
    }
  }

  // Distinct article types for filter
  const articleTypes = [...new Set([...valArtMap.values()].map(a => a.article_type).filter(Boolean) as string[])].sort();

  function outcomeColor(o: string): string {
    if (o === 'overscored')  return '#b91c1c';
    if (o === 'underscored') return '#2563eb';
    return '#92400e';
  }

  function buildFilterUrl(changes: Record<string, string | undefined>): string {
    const p: Record<string, string> = {};
    if (sp.outcome)      p.outcome      = sp.outcome;
    if (sp.promptId)     p.promptId     = sp.promptId;
    if (sp.articleType)  p.articleType  = sp.articleType;
    Object.assign(p, changes);
    Object.keys(p).forEach(k => p[k] === undefined && delete p[k]);
    const qs = new URLSearchParams(p as Record<string, string>).toString();
    return `/admin/lab/value-scoring/craft/validation/disagreements${qs ? `?${qs}` : ''}`;
  }

  const thStyle: React.CSSProperties = {
    textAlign: 'left', fontSize: '11px', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    color: '#5a6a85', padding: '10px 16px',
  };

  const selectedPromptId = sp.promptId ?? (promptIds.length === 1 ? promptIds[0] : null);

  return (
    <div style={{ fontFamily: 'var(--font-inter), Inter, sans-serif', background: '#f5f7fa', color: '#1a1a1a', minHeight: '100vh' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#E83B2A', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>
            The Lab · Value Scoring · Craft · Validation
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px' }}>Disagreements</h1>
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>
            Cases where the AI craft score did not align with human anchor comparisons.
          </p>
        </div>

        {/* Filters */}
        <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', padding: '14px 20px', marginBottom: '20px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#5a6a85', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Filter:</span>

          {/* Outcome */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {['', 'overscored', 'underscored', 'mixed'].map(o => (
              <Link key={o} href={buildFilterUrl({ outcome: o || undefined })} style={{ fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '99px', background: sp.outcome === o || (!sp.outcome && !o) ? '#1a1a1a' : '#f5f7fa', color: sp.outcome === o || (!sp.outcome && !o) ? '#fff' : '#5a6a85', textDecoration: 'none' }}>
                {o || 'All outcomes'}
              </Link>
            ))}
          </div>

          {/* Prompt */}
          {promptIds.length > 1 && (
            <div style={{ display: 'flex', gap: '4px' }}>
              <Link href={buildFilterUrl({ promptId: undefined })} style={{ fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '99px', background: !sp.promptId ? '#1a1a1a' : '#f5f7fa', color: !sp.promptId ? '#fff' : '#5a6a85', textDecoration: 'none' }}>
                All prompts
              </Link>
              {promptIds.map(pid => (
                <Link key={pid} href={buildFilterUrl({ promptId: pid })} style={{ fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '99px', background: sp.promptId === pid ? '#1a1a1a' : '#f5f7fa', color: sp.promptId === pid ? '#fff' : '#5a6a85', textDecoration: 'none' }}>
                  v{promptVersionMap.get(pid) ?? '?'}
                </Link>
              ))}
            </div>
          )}

          {/* Article type */}
          {articleTypes.length > 1 && (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              <Link href={buildFilterUrl({ articleType: undefined })} style={{ fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '99px', background: !sp.articleType ? '#1a1a1a' : '#f5f7fa', color: !sp.articleType ? '#fff' : '#5a6a85', textDecoration: 'none' }}>
                All types
              </Link>
              {articleTypes.map(t => (
                <Link key={t} href={buildFilterUrl({ articleType: t })} style={{ fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '99px', background: sp.articleType === t ? '#1a1a1a' : '#f5f7fa', color: sp.articleType === t ? '#fff' : '#5a6a85', textDecoration: 'none' }}>
                  {t}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Count */}
        <div style={{ fontSize: '13px', color: '#5a6a85', marginBottom: '16px' }}>
          {items.length} disagreement{items.length !== 1 ? 's' : ''} shown
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            No disagreements found for these filters.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {items.map(item => {
              const art        = valArtMap.get(item.validation_article_id);
              const promptId   = runPromptMap.get(item.run_id) ?? '';
              const anchors = [
                { id: item.anchor_low_id,  label: 'Low',  choice: item.choice_low  },
                { id: item.anchor_same_id, label: 'Same', choice: item.choice_same },
                { id: item.anchor_high_id, label: 'High', choice: item.choice_high },
              ];

              return (
                <div key={item.id} style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                  {/* Item header */}
                  <div style={{ background: '#EEF2F7', borderBottom: '1px solid #dde3ed', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: outcomeColor(item.outcome), textTransform: 'uppercase', letterSpacing: '0.06em', background: `${outcomeColor(item.outcome)}15`, padding: '2px 8px', borderRadius: '4px' }}>
                        {item.outcome}
                      </span>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                        v{promptVersionMap.get(promptId) ?? '?'}
                      </span>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#1a1a1a' }}>
                      craft: {item.craft_score !== null ? Number(item.craft_score).toFixed(1) : '—'}
                    </span>
                  </div>

                  <div style={{ padding: '18px 24px' }}>
                    {/* Article info */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.4, marginBottom: '4px' }}>
                        {art?.title ?? '—'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {[art?.journal, art?.article_type].filter(Boolean).join(' · ')}
                      </div>
                    </div>

                    {/* Reasoning */}
                    {item.reasoning && (
                      <div style={{ fontSize: '12px', color: '#5a6a85', lineHeight: 1.55, background: '#f8fafc', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px' }}>
                        <span style={{ fontWeight: 600 }}>Reasoning: </span>{item.reasoning}
                      </div>
                    )}

                    {/* Dimensions */}
                    {item.dimensions && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                        {Object.entries(item.dimensions).map(([key, val]) => (
                          <div key={key} style={{ fontSize: '11px', background: '#f5f7fa', borderRadius: '4px', padding: '3px 8px', color: '#5a6a85' }}>
                            <span style={{ fontWeight: 600 }}>{key.replace(/_/g, ' ')}</span>
                            {val && val.score !== null
                              ? <span style={{ color: '#1a1a1a', marginLeft: '4px' }}>{val.score}</span>
                              : <span style={{ color: '#bbb', marginLeft: '4px' }}>—</span>
                            }
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Anchors table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#fafbfc' }}>
                          <th style={{ ...thStyle, padding: '8px 12px' }}>Band</th>
                          <th style={{ ...thStyle, padding: '8px 12px' }}>Anchor article</th>
                          <th style={{ ...thStyle, padding: '8px 12px', textAlign: 'right' }}>Score</th>
                          <th style={{ ...thStyle, padding: '8px 12px' }}>Human chose</th>
                        </tr>
                      </thead>
                      <tbody>
                        {anchors.map(a => !a.id ? null : (
                          <tr key={a.id} style={{ borderTop: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '7px 12px', fontWeight: 600, color: '#5a6a85', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{a.label}</td>
                            <td style={{ padding: '7px 12px', color: '#1a1a1a' }}>{anchorArtMap.get(a.id) ?? '—'}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#1a1a1a' }}>
                              {anchorScoreMap.get(`${promptId}:${a.id}`) !== undefined
                                ? (anchorScoreMap.get(`${promptId}:${a.id}`) ?? null) !== null
                                  ? (anchorScoreMap.get(`${promptId}:${a.id}`) as number).toFixed(1)
                                  : '—'
                                : '—'}
                            </td>
                            <td style={{ padding: '7px 12px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: a.choice === 'new' ? '#059669' : '#2563eb', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {a.choice ?? '—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Suggest button */}
        {items.length > 0 && selectedPromptId && (
          <SuggestButton
            promptId={selectedPromptId}
            itemCount={items.length}
          />
        )}

        <div style={{ marginTop: '24px' }}>
          <Link href="/admin/lab/value-scoring/craft/validation" style={{ fontSize: '12px', color: '#94a3b8', textDecoration: 'none' }}>
            ← Back to validation
          </Link>
        </div>
      </div>
    </div>
  );
}
