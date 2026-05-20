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
  id:            string;
  title:         string;
  journal:       string | null;
  article_type:  string | null;
  published_date: string | null;
  abstract:      string | null;
  short_headline: string | null;
  resume:        string | null;
  bottom_line:   string | null;
  sari:          { subject?: string; action?: string; result?: string; implication?: string } | null;
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

interface Props {
  runId:     string;
  runStatus: string;
  nArticles: number;
}

const ACCENT = "#E83B2A";

export default function ValidationRunClient({ runId, runStatus: initialStatus, nArticles }: Props) {
  const [status,         setStatus]         = useState(initialStatus);
  const [currentItem,    setCurrentItem]    = useState<ValidationItem | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [done,           setDone]           = useState(false);

  // Choices for current item
  const [choiceLow,      setChoiceLow]      = useState<'new' | 'anchor' | null>(null);
  const [choiceSame,     setChoiceSame]     = useState<'new' | 'anchor' | null>(null);
  const [choiceHigh,     setChoiceHigh]     = useState<'new' | 'anchor' | null>(null);
  const [submitting,     setSubmitting]     = useState(false);
  const [lastOutcome,    setLastOutcome]    = useState<string | null>(null);
  const [validatedCount, setValidatedCount] = useState(0);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearChoices() {
    setChoiceLow(null);
    setChoiceSame(null);
    setChoiceHigh(null);
    setLastOutcome(null);
  }

  const fetchNext = useCallback(async () => {
    setLoading(true);
    setError(null);
    clearChoices();
    try {
      const res  = await fetch(`/api/admin/lab/value-scoring/craft/validation/run/${runId}/next`);
      const json = await res.json() as {
        ok: boolean;
        done?: boolean;
        runStatus?: string;
        item?: ValidationItem;
        error?: string;
      };
      if (!json.ok) { setError(json.error ?? 'Failed to fetch next item'); return; }
      if (json.runStatus) setStatus(json.runStatus);
      if (json.done) {
        setDone(true);
      } else {
        setCurrentItem(json.item ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch next item');
    } finally {
      setLoading(false);
    }
  }, [runId]);

  const triggerScoring = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/lab/value-scoring/craft/validation/run/${runId}/score`, { method: 'POST' });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? 'Scoring failed');
        setLoading(false);
        return;
      }
      // After scoring completes, fetch the first item
      await fetchNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scoring failed');
      setLoading(false);
    }
  }, [runId, fetchNext]);

  // Poll for status changes when scoring is in progress
  const pollStatus = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/lab/value-scoring/craft/validation/run/${runId}/next`);
      const json = await res.json() as { ok: boolean; runStatus?: string; done?: boolean; item?: ValidationItem };
      if (!json.ok) return;
      if (json.runStatus) setStatus(json.runStatus);
      if (json.runStatus === 'validating' || json.runStatus === 'complete') {
        if (json.done) {
          setDone(true);
        } else if (json.item) {
          setCurrentItem(json.item);
          setLoading(false);
        }
      } else {
        // Still scoring — keep polling
        pollTimerRef.current = setTimeout(pollStatus, 3000);
      }
    } catch { /* ignore poll errors */ }
  }, [runId]);

  useEffect(() => {
    if (initialStatus === 'pending') {
      void triggerScoring();
    } else if (initialStatus === 'scoring') {
      setLoading(true);
      pollTimerRef.current = setTimeout(pollStatus, 3000);
    } else if (initialStatus === 'validating') {
      void fetchNext();
    } else if (initialStatus === 'complete') {
      setDone(true);
    }
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!currentItem || !choiceLow || !choiceSame || !choiceHigh) return;
    setSubmitting(true);
    try {
      const res  = await fetch(`/api/admin/lab/value-scoring/craft/validation/run/${runId}/submit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          itemId:     currentItem.id,
          choiceLow,
          choiceSame,
          choiceHigh,
        }),
      });
      const json = await res.json() as { ok: boolean; outcome?: string; error?: string };
      if (!json.ok) {
        setError(json.error ?? 'Submit failed');
        return;
      }
      setLastOutcome(json.outcome ?? null);
      setValidatedCount(c => c + 1);
      // Brief pause to show outcome, then fetch next
      setTimeout(() => { void fetchNext(); }, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  const allChosen = choiceLow !== null && choiceSame !== null && choiceHigh !== null;

  // ── Render helpers ────────────────────────────────────────────────────────

  function fmtScore(s: number | null): string {
    return s !== null ? s.toFixed(1) : '—';
  }

  function outcomeColor(o: string): string {
    if (o === 'agree')       return '#059669';
    if (o === 'overscored')  return '#b91c1c';
    if (o === 'underscored') return '#2563eb';
    return '#92400e';
  }

  return (
    <div style={{ fontFamily: 'var(--font-inter), Inter, sans-serif', background: '#f5f7fa', color: '#1a1a1a', minHeight: '100vh' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', color: ACCENT, textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>
            The Lab · Value Scoring · Craft · Validation
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 4px' }}>Validation Run</h1>
          <div style={{ fontSize: '13px', color: '#888' }}>
            {nArticles} articles · status: <span style={{ fontWeight: 600, color: '#1a1a1a', textTransform: 'uppercase', fontSize: '11px' }}>{status}</span>
            {validatedCount > 0 && <> · {validatedCount} validated</>}
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#b91c1c' }}>
            {error}
          </div>
        )}

        {/* Loading / scoring state */}
        {loading && !currentItem && (
          <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#5a6a85', marginBottom: '8px' }}>
              {status === 'pending' || status === 'scoring' ? 'Scoring articles with prompt…' : 'Loading next item…'}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>This may take a moment.</div>
          </div>
        )}

        {/* Completion */}
        {done && (
          <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#059669', marginBottom: '10px' }}>Run complete!</div>
            <p style={{ fontSize: '13px', color: '#5a6a85', marginBottom: '24px' }}>
              All {nArticles} articles have been validated.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <Link
                href="/admin/lab/value-scoring/craft/validation"
                style={{ background: '#fff', color: '#5a6a85', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px 16px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
              >
                ← Back to validation
              </Link>
              <Link
                href="/admin/lab/value-scoring/craft/validation/disagreements"
                style={{ background: ACCENT, color: '#fff', borderRadius: '6px', padding: '10px 18px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
              >
                View disagreements →
              </Link>
            </div>
          </div>
        )}

        {/* Outcome flash */}
        {lastOutcome && !done && (
          <div style={{ background: '#fff', border: `2px solid ${outcomeColor(lastOutcome)}`, borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', fontWeight: 600, color: outcomeColor(lastOutcome), textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>
            {lastOutcome}
          </div>
        )}

        {/* Validation UI */}
        {currentItem && !done && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Article under test */}
            <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
              <div style={{ background: '#EEF2F7', borderBottom: '1px solid #dde3ed', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#5a6a85', textTransform: 'uppercase', fontWeight: 700 }}>
                  New Article
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: ACCENT }}>
                  craft score: {fmtScore(currentItem.craftScore)}
                </span>
              </div>
              <div style={{ padding: '20px 24px' }}>
                {currentItem.article ? (
                  <>
                    <div style={{ fontSize: '16px', fontWeight: 600, lineHeight: 1.4, marginBottom: '6px' }}>
                      {currentItem.article.title}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px' }}>
                      {[currentItem.article.journal, currentItem.article.article_type].filter(Boolean).join(' · ')}
                    </div>
                    {currentItem.article.abstract && (
                      <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6, marginBottom: '14px', background: '#f8fafc', borderRadius: '6px', padding: '12px 14px', maxHeight: '180px', overflowY: 'auto' }}>
                        {currentItem.article.abstract}
                      </div>
                    )}
                    {currentItem.reasoning && (
                      <div style={{ fontSize: '12px', color: '#5a6a85', lineHeight: 1.55, borderTop: '1px solid #f0f0f0', paddingTop: '12px' }}>
                        <span style={{ fontWeight: 600 }}>Reasoning: </span>{currentItem.reasoning}
                      </div>
                    )}
                    {currentItem.dimensions && (
                      <div style={{ marginTop: '12px', borderTop: '1px solid #f0f0f0', paddingTop: '12px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#5a6a85', marginBottom: '8px' }}>Dimensions</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {Object.entries(currentItem.dimensions).map(([key, val]) => (
                            <div key={key} style={{ fontSize: '11px', background: '#f5f7fa', borderRadius: '4px', padding: '3px 8px', color: '#5a6a85' }}>
                              <span style={{ fontWeight: 600 }}>{key.replace(/_/g, ' ')}</span>
                              {val && val.score !== null ? <span style={{ color: '#1a1a1a', marginLeft: '4px' }}>{val.score}</span> : <span style={{ color: '#bbb', marginLeft: '4px' }}>—</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '13px' }}>Article data not available.</div>
                )}
              </div>
            </div>

            {/* Comparisons */}
            {(['low', 'same', 'high'] as const).map(band => {
              const anchor = band === 'low' ? currentItem.anchorLow : band === 'same' ? currentItem.anchorSame : currentItem.anchorHigh;
              const choice = band === 'low' ? choiceLow : band === 'same' ? choiceSame : choiceHigh;
              const setChoice = band === 'low' ? setChoiceLow : band === 'same' ? setChoiceSame : setChoiceHigh;

              const bandLabel = band === 'low' ? 'Lower-band anchor' : band === 'same' ? 'Same-band anchor' : 'Higher-band anchor';
              const bandSubtitle = band === 'low'
                ? 'The new article should score higher than this anchor'
                : band === 'high'
                  ? 'The new article should score lower than this anchor'
                  : 'The new article should score roughly the same as this anchor';

              return (
                <div key={band} style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                  <div style={{ background: '#EEF2F7', borderBottom: '1px solid #dde3ed', padding: '10px 24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#5a6a85', textTransform: 'uppercase', fontWeight: 700 }}>
                        {bandLabel}
                      </span>
                      {anchor && (
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                          craft score: <strong style={{ color: '#1a1a1a' }}>{fmtScore(anchor.craft_score)}</strong>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{bandSubtitle}</div>
                  </div>
                  <div style={{ padding: '16px 24px' }}>
                    {anchor ? (
                      <>
                        <div style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1.4, marginBottom: '4px' }}>{anchor.title}</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px' }}>
                          {[anchor.journal, anchor.article_type].filter(Boolean).join(' · ')}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#5a6a85', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Which article has higher craft?
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => setChoice('new')}
                                style={{
                                  flex: 1, padding: '10px 14px', fontSize: '13px', fontWeight: 600,
                                  border: choice === 'new' ? `2px solid ${ACCENT}` : '1px solid #e5e7eb',
                                  background: choice === 'new' ? '#fef2f2' : '#fff',
                                  color: choice === 'new' ? ACCENT : '#5a6a85',
                                  borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
                                  transition: 'all 0.1s',
                                }}
                              >
                                New article
                              </button>
                              <button
                                onClick={() => setChoice('anchor')}
                                style={{
                                  flex: 1, padding: '10px 14px', fontSize: '13px', fontWeight: 600,
                                  border: choice === 'anchor' ? '2px solid #2563eb' : '1px solid #e5e7eb',
                                  background: choice === 'anchor' ? '#eff6ff' : '#fff',
                                  color: choice === 'anchor' ? '#2563eb' : '#5a6a85',
                                  borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
                                  transition: 'all 0.1s',
                                }}
                              >
                                Anchor article
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ color: '#94a3b8', fontSize: '13px' }}>No anchor assigned for this band.</div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Submit */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center' }}>
              {!allChosen && (
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Choose for all three comparisons to submit</span>
              )}
              <button
                onClick={handleSubmit}
                disabled={!allChosen || submitting}
                style={{
                  background: !allChosen || submitting ? '#fda99e' : ACCENT,
                  color: '#fff', border: 'none', borderRadius: '6px',
                  padding: '10px 22px', fontSize: '13px', fontWeight: 600,
                  cursor: !allChosen || submitting ? 'default' : 'pointer',
                }}
              >
                {submitting ? 'Saving…' : 'Submit & next →'}
              </button>
            </div>
          </div>
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
