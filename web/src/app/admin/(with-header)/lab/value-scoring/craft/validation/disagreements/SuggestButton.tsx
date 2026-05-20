"use client";

import { useState } from "react";

interface Props {
  promptId:    string;
  itemCount:   number;
}

const ACCENT = "#E83B2A";

export default function SuggestButton({ promptId, itemCount }: Props) {
  const [loading,      setLoading]      = useState(false);
  const [suggestions,  setSuggestions]  = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  async function handleSuggest() {
    setLoading(true);
    setError(null);
    setSuggestions(null);
    try {
      const res  = await fetch('/api/admin/lab/value-scoring/craft/validation/suggest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ promptId }),
      });
      const json = await res.json() as { ok: boolean; suggestions?: string; error?: string };
      if (!json.ok) {
        setError(json.error ?? 'Suggestion failed');
      } else {
        setSuggestions(json.suggestions ?? '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suggestion failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: '24px' }}>
      {!suggestions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleSuggest}
            disabled={loading}
            style={{
              background: loading ? '#fda99e' : ACCENT,
              color: '#fff', border: 'none', borderRadius: '6px',
              padding: '10px 18px', fontSize: '13px', fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Analysing…' : `Generate prompt suggestions from ${itemCount} disagreement${itemCount !== 1 ? 's' : ''} →`}
          </button>
          {error && <span style={{ fontSize: '12px', color: '#b91c1c' }}>{error}</span>}
        </div>
      )}

      {suggestions && (
        <div style={{ background: '#fff', borderRadius: '10px', border: `2px solid ${ACCENT}`, padding: '20px 24px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', color: ACCENT, textTransform: 'uppercase', fontWeight: 700, marginBottom: '12px' }}>
            AI Suggestions
          </div>
          <div style={{ fontSize: '13px', color: '#1a1a1a', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {suggestions}
          </div>
          <button
            onClick={() => { setSuggestions(null); setError(null); }}
            style={{ marginTop: '16px', background: '#fff', color: '#5a6a85', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px 14px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
