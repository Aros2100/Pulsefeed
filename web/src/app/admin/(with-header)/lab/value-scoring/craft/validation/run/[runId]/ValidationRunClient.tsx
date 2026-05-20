"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface AnchorArticle {
  id:           string;
  title:        string;
  journal:      string | null;
  article_type: string | null;
  craft_score:  number | null;
}

interface ValidationArticle {
  id:           string;
  title:        string;
  journal:      string | null;
  article_type: string | null;
  abstract:     string | null;
}

interface ValidationItem {
  id:         string;
  craftScore: number | null;
  dimensions: Record<string, { score: number | null; status: string }> | null;
  reasoning:  string | null;
  article:    ValidationArticle | null;
  anchorLow:  AnchorArticle | null;
  anchorSame: AnchorArticle | null;
  anchorHigh: AnchorArticle | null;
}

interface Comparison {
  type:   'low' | 'same' | 'high';
  anchor: AnchorArticle;
  choice: 'new' | 'anchor' | null;
}

type Phase = 'loading' | 'scoring' | 'comparing' | 'outcome' | 'done';

interface Props {
  runId:     string;
  runStatus: string;
  nArticles: number;
}

const ACCENT = "#E83B2A";

function computeOutcome(low: string, same: string, high: string): string {
  const wins = [low, same, high].filter(c => c === 'new').length;
  if (wins === 3) return 'underscored';
  if (wins === 0) return 'overscored';
  if (low === 'new' && high === 'anchor') return 'agree';
  return 'mixed';
}

function outcomeAccent(o: string) {
  if (o === 'agree')       return '#059669';
  if (o === 'overscored')  return '#b91c1c';
  if (o === 'underscored') return '#2563eb';
  return '#92400e';
}

const OUTCOME_LABELS: Record<string, string> = {
  agree:       'Agree',
  overscored:  'Overscored',
  underscored: 'Underscored',
  mixed:       'Mixed',
};

const OUTCOME_DESC: Record<string, string> = {
  agree:       'The prompt placed this article correctly relative to the anchors.',
  overscored:  'The prompt scored this article too high — it lost to all three anchors.',
  underscored: 'The prompt scored this article too low — it beat all three anchors.',
  mixed:       'The prompt\'s score was directionally inconsistent with the comparisons.',
};

const BAND_LABELS: Record<string, string> = {
  low:  'Lower-band anchor',
  same: 'Same-band anchor',
  high: 'Upper-band anchor',
};

export default function ValidationRunClient({ runId, runStatus: initialStatus, nArticles }: Props) {
  const [phase,          setPhase]          = useState<Phase>(initialStatus === 'complete' ? 'done' : 'loading');
  const [status,         setStatus]         = useState(initialStatus);
  const [currentItem,    setCurrentItem]    = useState<ValidationItem | null>(null);
  const [comparisons,    setComparisons]    = useState<Comparison[]>([]);
  const [step,           setStep]           = useState(0);
  const [error,          setError]          = useState<string | null>(null);
  const [submitting,     setSubmitting]     = useState(false);
  const [validatedCount, setValidatedCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buildComparisons(item: ValidationItem): Comparison[] {
    const entries: Comparison[] = [];
    if (item.anchorLow)  entries.push({ type: 'low',  anchor: item.anchorLow,  choice: null });
    if (item.anchorSame) entries.push({ type: 'same', anchor: item.anchorSame, choice: null });
    if (item.anchorHigh) entries.push({ type: 'high', anchor: item.anchorHigh, choice: null });
    // Fisher-Yates shuffle so band order is unknown to validator
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    return entries;
  }

  const fetchNext = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const res  = await fetch(`/api/admin/lab/value-scoring/craft/validation/run/${runId}/next`);
      const json = await res.json() as { ok: boolean; done?: boolean; runStatus?: string; item?: ValidationItem; error?: string };
      if (!json.ok) { setError(json.error ?? 'Failed to load next item'); return; }
      if (json.runStatus) setStatus(json.runStatus);
      if (json.done) {
        setPhase('done');
      } else if (json.item) {
        setCurrentItem(json.item);
        setComparisons(buildComparisons(json.item));
        setStep(0);
        setPhase('comparing');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load next item');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const triggerScoring = useCallback(async () => {
    setPhase('scoring');
    setError(null);
    try {
      const res  = await fetch(`/api/admin/lab/value-scoring/craft/validation/run/${runId}/score`, { method: 'POST' });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) { setError(json.error ?? 'Scoring failed'); setPhase('loading'); return; }
      await fetchNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scoring failed');
      setPhase('loading');
    }
  }, [runId, fetchNext]);

  const pollStatus = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/lab/value-scoring/craft/validation/run/${runId}/next`);
      const json = await res.json() as { ok: boolean; runStatus?: string; done?: boolean; item?: ValidationItem };
      if (!json.ok) return;
      if (json.runStatus) setStatus(json.runStatus);
      if (json.runStatus === 'validating' || json.runStatus === 'complete') {
        if (json.done) {
          setPhase('done');
        } else if (json.item) {
          setCurrentItem(json.item);
          setComparisons(buildComparisons(json.item));
          setStep(0);
          setPhase('comparing');
        }
      } else {
        pollRef.current = setTimeout(pollStatus, 3000);
      }
    } catch { /* ignore poll errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    if      (initialStatus === 'pending')    void triggerScoring();
    else if (initialStatus === 'scoring')  { setPhase('scoring'); pollRef.current = setTimeout(pollStatus, 3000); }
    else if (initialStatus === 'validating') void fetchNext();
    else if (initialStatus === 'complete')   setPhase('done');
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChoice(choice: 'new' | 'anchor') {
    const updated = comparisons.map((c, i) => i === step ? { ...c, choice } : c);
    setComparisons(updated);
    if (step < comparisons.length - 1) setStep(step + 1);
    else setPhase('outcome');
  }

  async function handleNext() {
    if (!currentItem || submitting) return;
    const byType: Record<string, 'new' | 'anchor'> = {};
    for (const c of comparisons) if (c.choice) byType[c.type] = c.choice;

    setSubmitting(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/lab/value-scoring/craft/validation/run/${runId}/submit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          itemId:     currentItem.id,
          choiceLow:  byType['low']  ?? 'anchor',
          choiceSame: byType['same'] ?? 'anchor',
          choiceHigh: byType['high'] ?? 'anchor',
        }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) { setError(json.error ?? 'Submit failed'); return; }
      setValidatedCount(n => n + 1);
      await fetchNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  const outcome = phase === 'outcome' ? (() => {
    const m: Record<string, string> = { low: 'anchor', same: 'anchor', high: 'anchor' };
    for (const c of comparisons) m[c.type] = c.choice ?? 'anchor';
    return computeOutcome(m.low, m.same, m.high);
  })() : null;

  // ── Shared article card used for both A and B slots ───────────────────────

  function ArticleCard({ label, accent, title, meta, abstract, onClick }: {
    label:    string;
    accent:   string;
    title:    string;
    meta:     string;
    abstract?: string | null;
    onClick:  () => void;
  }) {
    const [hovered, setHovered] = useState(false);
    return (
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          textAlign: 'left', padding: '20px', borderRadius: '10px',
          border: `2px solid ${hovered ? accent : '#e5e7eb'}`,
          background: hovered ? `${accent}08` : '#fff',
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          transition: 'border-color 0.1s, background 0.1s',
          width: '100%',
        }}
      >
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: accent, marginBottom: '8px' }}>
          {label}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1.4, color: '#1a1a1a', marginBottom: '5px' }}>
          {title}
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: abstract ? '10px' : 0 }}>
          {meta}
        </div>
        {abstract && (
          <div style={{ fontSize: '12px', color: '#374151', lineHeight: 1.55, maxHeight: '110px', overflowY: 'auto' }}>
            {abstract.length > 420 ? abstract.slice(0, 420) + '…' : abstract}
          </div>
        )}
      </button>
    );
  }

  // ── Layout shell ──────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: 'var(--font-inter), Inter, sans-serif', background: '#f5f7fa', color: '#1a1a1a', minHeight: '100vh' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.08em', color: ACCENT, textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>
              The Lab · Value Scoring · Craft · Validation
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Validation Run</h1>
          </div>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>
            {nArticles} articles{validatedCount > 0 ? ` · ${validatedCount} validated` : ''}
          </span>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#b91c1c' }}>
            {error}
          </div>
        )}

        {/* ── Loading / scoring ──────────────────────────────────────────── */}
        {(phase === 'loading' || phase === 'scoring') && (
          <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', padding: '56px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#5a6a85', marginBottom: '6px' }}>
              {phase === 'scoring' ? 'Scoring articles with prompt…' : 'Loading…'}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>This may take a moment.</div>
          </div>
        )}

        {/* ── Sequential comparison ──────────────────────────────────────── */}
        {phase === 'comparing' && currentItem && comparisons.length > 0 && (() => {
          const comp = comparisons[step];
          const art  = currentItem.article;
          return (
            <div>
              {/* Progress bar + label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#5a6a85', whiteSpace: 'nowrap' }}>
                  Comparison {step + 1} of {comparisons.length}
                </span>
                <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                  {comparisons.map((_, i) => (
                    <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i < step ? '#059669' : i === step ? ACCENT : '#e5e7eb' }} />
                  ))}
                </div>
              </div>

              {/* Question */}
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', textAlign: 'center', marginBottom: '22px' }}>
                Which article demonstrates higher scientific craft?
              </div>

              {/* Two article cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <ArticleCard
                  label="Article A"
                  accent={ACCENT}
                  title={art?.title ?? '—'}
                  meta={[art?.journal, art?.article_type].filter(Boolean).join(' · ')}
                  abstract={art?.abstract}
                  onClick={() => handleChoice('new')}
                />
                <ArticleCard
                  label="Article B"
                  accent="#2563eb"
                  title={comp.anchor.title}
                  meta={[comp.anchor.journal, comp.anchor.article_type].filter(Boolean).join(' · ')}
                  onClick={() => handleChoice('anchor')}
                />
              </div>

              {/* Back navigation */}
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  style={{ fontSize: '12px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}
                >
                  ← Previous comparison
                </button>
              )}
            </div>
          );
        })()}

        {/* ── Outcome screen ─────────────────────────────────────────────── */}
        {phase === 'outcome' && currentItem && outcome && (
          <div>
            {/* Outcome badge */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'inline-block', background: outcomeAccent(outcome), color: '#fff', fontWeight: 700, fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 22px', borderRadius: '8px', marginBottom: '8px' }}>
                {OUTCOME_LABELS[outcome]}
              </div>
              <div style={{ fontSize: '13px', color: '#5a6a85' }}>{OUTCOME_DESC[outcome]}</div>
            </div>

            {/* New article details */}
            <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: '14px' }}>
              <div style={{ background: '#EEF2F7', borderBottom: '1px solid #dde3ed', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#5a6a85', textTransform: 'uppercase', fontWeight: 700 }}>
                  New Article
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                  Craft score: {currentItem.craftScore !== null ? currentItem.craftScore.toFixed(1) : '—'}
                </span>
              </div>
              <div style={{ padding: '18px 24px' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.4, marginBottom: '4px' }}>
                  {currentItem.article?.title}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: currentItem.reasoning ? '14px' : 0 }}>
                  {[currentItem.article?.journal, currentItem.article?.article_type].filter(Boolean).join(' · ')}
                </div>

                {currentItem.reasoning && (
                  <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6, marginBottom: currentItem.dimensions ? '14px' : 0, borderLeft: '3px solid #e5e7eb', paddingLeft: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#5a6a85', marginBottom: '4px' }}>
                      Reasoning
                    </div>
                    {currentItem.reasoning}
                  </div>
                )}

                {currentItem.dimensions && Object.keys(currentItem.dimensions).length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#5a6a85', marginBottom: '7px' }}>
                      Dimensions
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {Object.entries(currentItem.dimensions).map(([key, val]) => (
                        <div key={key} style={{ fontSize: '11px', background: '#f5f7fa', borderRadius: '4px', padding: '3px 8px', color: '#5a6a85' }}>
                          <span style={{ fontWeight: 600 }}>{key.replace(/_/g, ' ')}</span>
                          {val?.score !== null && val?.score !== undefined
                            ? <span style={{ color: '#1a1a1a', marginLeft: '4px' }}>{val.score}</span>
                            : <span style={{ color: '#bbb', marginLeft: '4px' }}>—</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Anchor results */}
            <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: '22px' }}>
              <div style={{ background: '#EEF2F7', borderBottom: '1px solid #dde3ed', padding: '10px 24px' }}>
                <span style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#5a6a85', textTransform: 'uppercase', fontWeight: 700 }}>
                  Your Comparisons
                </span>
              </div>
              {comparisons.map((comp, i) => {
                const won       = comp.choice === 'new';
                const expected  = (comp.type === 'low' && won) || (comp.type === 'high' && !won) || comp.type === 'same';
                const choiceClr = expected ? '#059669' : '#b91c1c';
                return (
                  <div key={i} style={{ padding: '14px 24px', borderBottom: i < comparisons.length - 1 ? '1px solid #f5f5f5' : 'none', display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: '3px' }}>
                        {BAND_LABELS[comp.type]}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#1a1a1a', lineHeight: 1.3 }}>
                        {comp.anchor.title}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        Craft score: <strong style={{ color: '#374151' }}>{comp.anchor.craft_score !== null ? comp.anchor.craft_score.toFixed(1) : '—'}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', paddingTop: '2px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: choiceClr }}>
                        {won ? 'New article won' : 'Anchor won'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Next article */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleNext}
                disabled={submitting}
                style={{
                  background: submitting ? '#fda99e' : ACCENT,
                  color: '#fff', border: 'none', borderRadius: '6px',
                  padding: '12px 26px', fontSize: '13px', fontWeight: 600,
                  cursor: submitting ? 'default' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {submitting ? 'Saving…' : 'Next article →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Done ──────────────────────────────────────────────────────── */}
        {phase === 'done' && (
          <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', padding: '56px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#059669', marginBottom: '10px' }}>
              Run complete!
            </div>
            <p style={{ fontSize: '13px', color: '#5a6a85', marginBottom: '26px' }}>
              All {nArticles} articles have been validated.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <Link href="/admin/lab/value-scoring/craft/validation" style={{ background: '#fff', color: '#5a6a85', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px 16px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                ← Back to validation
              </Link>
              <Link href="/admin/lab/value-scoring/craft/validation/disagreements" style={{ background: ACCENT, color: '#fff', borderRadius: '6px', padding: '10px 18px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                View disagreements →
              </Link>
            </div>
          </div>
        )}

        <div style={{ marginTop: '28px' }}>
          <Link href="/admin/lab/value-scoring/craft/validation" style={{ fontSize: '12px', color: '#94a3b8', textDecoration: 'none' }}>
            ← Back to validation
          </Link>
        </div>
      </div>
    </div>
  );
}
