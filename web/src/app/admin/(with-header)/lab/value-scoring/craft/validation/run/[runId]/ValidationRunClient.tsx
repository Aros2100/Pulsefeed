"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  type Article,
  fmtDate,
} from "@/app/admin/(with-header)/lab/value-scoring/craft/pairwise/PairwiseClient";

// Article with abstract — used in the comparison view
interface ArticleWithAbstract extends Article {
  abstract: string | null;
}

// Anchor extends Article with craft_score (outcome screen) and abstract (comparison view)
interface AnchorArticle extends Article {
  craft_score: number | null;
  abstract:    string | null;
}

interface ValidationItem {
  id:         string;
  craftScore: number | null;
  dimensions: Record<string, { score: number | null; status: string }> | null;
  reasoning:  string | null;
  article:    ArticleWithAbstract | null;
  anchorLow:  AnchorArticle | null;
  anchorHigh: AnchorArticle | null;
}

interface Comparison {
  type:   'low' | 'high';
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

function computeOutcome(low: string, high: string): string {
  if (low === 'new'    && high === 'new')    return 'underscored';
  if (low === 'anchor' && high === 'anchor') return 'overscored';
  if (low === 'new'    && high === 'anchor') return 'agree';
  return 'mixed';
}

function outcomeAccent(o: string) {
  if (o === 'agree')       return '#059669';
  if (o === 'overscored')  return '#b91c1c';
  if (o === 'underscored') return '#2563eb';
  return '#92400e';
}

const OUTCOME_LABELS: Record<string, string> = {
  agree: 'Agree', overscored: 'Overscored', underscored: 'Underscored', mixed: 'Mixed',
};
const OUTCOME_DESC: Record<string, string> = {
  agree:       'The prompt placed this article correctly relative to both anchors.',
  overscored:  'The prompt scored this article too high — it lost to both anchors.',
  underscored: 'The prompt scored this article too low — it beat both anchors.',
  mixed:       "The prompt's score was directionally inconsistent with the comparisons.",
};
const BAND_LABELS: Record<string, string> = {
  low:  'Lower anchor (−10 to −15)',
  high: 'Upper anchor (+10 to +15)',
};

export default function ValidationRunClient({ runId, runStatus: initialStatus, nArticles }: Props) {
  const [phase,           setPhase]          = useState<Phase>(initialStatus === 'complete' ? 'done' : 'loading');
  const [status,          setStatus]         = useState(initialStatus);
  const [currentItem,     setCurrentItem]    = useState<ValidationItem | null>(null);
  const [comparisons,     setComparisons]    = useState<Comparison[]>([]);
  const [step,            setStep]           = useState(0);
  const [error,           setError]          = useState<string | null>(null);
  const [submitting,      setSubmitting]     = useState(false);
  const [validatedCount,  setValidatedCount] = useState(0);
  const [validatorNotes,  setValidatorNotes] = useState('');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buildComparisons(item: ValidationItem): Comparison[] {
    const entries: Comparison[] = [];
    if (item.anchorLow)  entries.push({ type: 'low',  anchor: item.anchorLow,  choice: null });
    if (item.anchorHigh) entries.push({ type: 'high', anchor: item.anchorHigh, choice: null });
    // Randomise order so validator can't infer which is lower/upper
    if (entries.length === 2 && Math.random() > 0.5) entries.reverse();
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
        setValidatorNotes('');
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
        if (json.done) setPhase('done');
        else if (json.item) {
          setCurrentItem(json.item);
          setComparisons(buildComparisons(json.item));
          setStep(0);
          setPhase('comparing');
        }
      } else {
        pollRef.current = setTimeout(pollStatus, 3000);
      }
    } catch { /* ignore */ }
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
    const m: Record<string, 'new' | 'anchor'> = {};
    for (const c of comparisons) if (c.choice) m[c.type] = c.choice;

    setSubmitting(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/lab/value-scoring/craft/validation/run/${runId}/submit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          itemId:         currentItem.id,
          choiceLow:      m['low']  ?? 'anchor',
          choiceHigh:     m['high'] ?? 'anchor',
          validatorNotes: validatorNotes.trim() || null,
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
    const m: Record<string, string> = { low: 'anchor', high: 'anchor' };
    for (const c of comparisons) m[c.type] = c.choice ?? 'anchor';
    return computeOutcome(m.low, m.high);
  })() : null;

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: 'var(--font-inter), Inter, sans-serif', background: '#f5f7fa', color: '#1a1a1a', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 0 80px' }}>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', margin: '24px 24px 0', fontSize: '13px', color: '#b91c1c' }}>
            {error}
          </div>
        )}

        {/* ── Loading / scoring ──────────────────────────────────────────── */}
        {(phase === 'loading' || phase === 'scoring') && (
          <div style={{ padding: '24px' }}>
            <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', padding: '56px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: '#5a6a85', marginBottom: '6px' }}>
                {phase === 'scoring' ? 'Scoring articles with prompt…' : 'Loading…'}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>This may take a moment.</div>
            </div>
          </div>
        )}

        {/* ── Comparing: one anchor at a time ────────────────────────────── */}
        {phase === 'comparing' && currentItem && comparisons.length > 0 && (() => {
          const comp = comparisons[step];
          return (
            <>
              {/* Progress bar + header — same background as pairwise bottom bar */}
              <div style={{ background: '#eef0f4', padding: '12px 24px 14px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#5a6a85', whiteSpace: 'nowrap' }}>
                  Comparison {step + 1} of {comparisons.length}
                </span>
                <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                  {comparisons.map((_, i) => (
                    <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i < step ? '#059669' : i === step ? ACCENT : '#d1d5db' }} />
                  ))}
                </div>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {nArticles} articles{validatedCount > 0 ? ` · ${validatedCount} done` : ''}
                </span>
              </div>

              {/* Question */}
              <div style={{ padding: '14px 24px 10px', fontSize: '13px', fontWeight: 600, color: '#5a6a85', textAlign: 'center' }}>
                Which article demonstrates higher scientific craft?
              </div>

              {/* Article cards — show abstract, not AI-generated fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '0 8px', marginBottom: '8px' }}>
                <ValidationCard article={currentItem.article!} onChoose={() => handleChoice('new')} />
                <ValidationCard article={comp.anchor}          onChoose={() => handleChoice('anchor')} />
              </div>

              {/* Back navigation — same bottom bar */}
              <div style={{ background: '#eef0f4', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  onClick={() => setStep(s => s - 1)}
                  disabled={step === 0}
                  style={{ fontSize: '13px', fontFamily: 'inherit', padding: '8px 16px', background: '#fff', color: step > 0 ? '#5a6a85' : '#d1d5db', border: '1px solid', borderColor: step > 0 ? '#dde3ed' : '#f0f0f0', borderRadius: '8px', cursor: step > 0 ? 'pointer' : 'default' }}
                >
                  ← Previous
                </button>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Click an article to choose it</span>
              </div>
            </>
          );
        })()}

        {/* ── Outcome screen ─────────────────────────────────────────────── */}
        {phase === 'outcome' && currentItem && outcome && (
          <div style={{ padding: '24px' }}>

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
                <span style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#5a6a85', textTransform: 'uppercase', fontWeight: 700 }}>New Article</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                  Craft score: {currentItem.craftScore !== null ? currentItem.craftScore.toFixed(1) : '—'}
                </span>
              </div>
              <div style={{ padding: '18px 24px' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.4, marginBottom: '4px' }}>{currentItem.article?.title}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: currentItem.reasoning ? '14px' : 0 }}>
                  {[currentItem.article?.journal, currentItem.article?.article_type].filter(Boolean).join(' · ')}
                </div>
                {currentItem.reasoning && (
                  <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6, marginBottom: currentItem.dimensions ? '14px' : 0, borderLeft: '3px solid #e5e7eb', paddingLeft: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#5a6a85', marginBottom: '4px' }}>Reasoning</div>
                    {currentItem.reasoning}
                  </div>
                )}
                {currentItem.dimensions && Object.keys(currentItem.dimensions).length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#5a6a85', marginBottom: '7px' }}>Dimensions</div>
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
                <span style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#5a6a85', textTransform: 'uppercase', fontWeight: 700 }}>Your Comparisons</span>
              </div>
              {comparisons.map((comp, i) => {
                const won      = comp.choice === 'new';
                const expected = (comp.type === 'low' && won) || (comp.type === 'high' && !won);
                return (
                  <div key={i} style={{ padding: '14px 24px', borderBottom: i < comparisons.length - 1 ? '1px solid #f5f5f5' : 'none', display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: '3px' }}>{BAND_LABELS[comp.type]}</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#1a1a1a', lineHeight: 1.3 }}>{comp.anchor.title}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        Craft score: <strong style={{ color: '#374151' }}>{comp.anchor.craft_score !== null ? comp.anchor.craft_score.toFixed(1) : '—'}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', paddingTop: '2px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: expected ? '#059669' : '#b91c1c' }}>
                        {won ? 'New article won' : 'Anchor won'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Validator notes */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#5a6a85', marginBottom: '6px' }}>
                Notes <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#94a3b8' }}>(optional)</span>
              </div>
              <textarea
                value={validatorNotes}
                onChange={e => setValidatorNotes(e.target.value)}
                placeholder="Why did you choose what you did? What's the underlying pattern?"
                rows={3}
                style={{ width: '100%', fontSize: '13px', padding: '10px 12px', border: '1px solid #dde3ed', borderRadius: '8px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', color: '#1a1a1a' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleNext}
                disabled={submitting}
                style={{ background: submitting ? '#fda99e' : ACCENT, color: '#fff', border: 'none', borderRadius: '6px', padding: '12px 26px', fontSize: '13px', fontWeight: 600, cursor: submitting ? 'default' : 'pointer', fontFamily: 'inherit' }}
              >
                {submitting ? 'Saving…' : 'Next article →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Done ──────────────────────────────────────────────────────── */}
        {phase === 'done' && (
          <div style={{ padding: '24px' }}>
            <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', padding: '56px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#059669', marginBottom: '10px' }}>Run complete!</div>
              <p style={{ fontSize: '13px', color: '#5a6a85', marginBottom: '26px' }}>All {nArticles} articles have been validated.</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <Link href="/admin/lab/value-scoring/craft/validation" style={{ background: '#fff', color: '#5a6a85', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px 16px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                  ← Back to validation
                </Link>
                <Link href="/admin/lab/value-scoring/craft/validation/disagreements" style={{ background: ACCENT, color: '#fff', borderRadius: '6px', padding: '10px 18px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                  View disagreements →
                </Link>
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: '16px 24px 0' }}>
          <Link href="/admin/lab/value-scoring/craft/validation" style={{ fontSize: '12px', color: '#94a3b8', textDecoration: 'none' }}>
            ← Back to validation
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Validation comparison card ────────────────────────────────────────────────
// Shows: title · meta · SARI · abstract. No short_headline / resume / bottom_line.

function ValidationCard({ article, onChoose }: {
  article: ArticleWithAbstract | AnchorArticle;
  onChoose: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const meta = [article.journal, fmtDate(article.published_date), article.article_type]
    .filter(Boolean).join(' · ');
  const sari = article.sari;
  return (
    <div
      className="article-card"
      onClick={onChoose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:   '#fff',
        borderRadius: '10px',
        border:       hovered ? `2px solid ${ACCENT}` : '1px solid #e5e7eb',
        boxShadow:    '0 1px 3px rgba(0,0,0,0.07)',
        overflow:     'hidden',
        cursor:       'pointer',
        transition:   'border-color 0.1s',
      }}
    >
      <div style={{ padding: '20px 24px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1.4, marginBottom: '6px' }}>
          {article.title}
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '14px' }}>
          {meta}
        </div>

        {/* SARI */}
        {sari && (
          <div style={{ borderTop: '1px solid #ebebeb', paddingTop: '12px', marginTop: '0', marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#5a6a85', marginBottom: '8px' }}>SARI</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#fafafa', borderRadius: '6px', padding: '12px' }}>
              {(['subject', 'action', 'result', 'implication'] as const).map(key => (
                <div key={key}>
                  <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '3px' }}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </div>
                  <div style={{ fontSize: '12px', color: sari[key] ? '#374151' : '#bbb', lineHeight: 1.5 }}>
                    {sari[key] ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Abstract */}
        {article.abstract ? (
          <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6, borderTop: sari ? '1px solid #ebebeb' : 'none', paddingTop: sari ? '12px' : 0 }}>
            {article.abstract}
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: '#bbb', fontStyle: 'italic' }}>
            Abstract not available.
          </div>
        )}
      </div>
    </div>
  );
}
