"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PromptOption {
  id:      string;
  version: number;
}

interface Props {
  poolCount:     number;
  promptOptions: PromptOption[];
}

const ACCENT = "#E83B2A";

export default function ValidationLandingClient({ poolCount, promptOptions }: Props) {
  const router = useRouter();

  // Import form
  const [importCount,    setImportCount]    = useState(500);
  const [importing,      setImporting]      = useState(false);
  const [importResult,   setImportResult]   = useState<string | null>(null);
  const [importError,    setImportError]    = useState<string | null>(null);

  // Start run form
  const [selectedPrompt, setSelectedPrompt] = useState(promptOptions[0]?.id ?? "");
  const [nArticles,      setNArticles]      = useState(10);
  const [creating,       setCreating]       = useState(false);
  const [createError,    setCreateError]    = useState<string | null>(null);

  async function handleImport() {
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const res  = await fetch('/api/admin/lab/value-scoring/craft/validation/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ count: importCount }),
      });
      const json = await res.json() as { ok: boolean; imported?: number; error?: string };
      if (!json.ok) {
        setImportError(json.error ?? 'Import failed');
      } else {
        setImportResult(`Imported ${json.imported ?? 0} articles`);
        router.refresh();
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function handleCreateRun() {
    if (!selectedPrompt) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res  = await fetch('/api/admin/lab/value-scoring/craft/validation/run/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ promptId: selectedPrompt, nArticles }),
      });
      const json = await res.json() as { ok: boolean; runId?: string; error?: string };
      if (!json.ok) {
        setCreateError(json.error ?? 'Failed to create run');
      } else {
        router.push(`/admin/lab/value-scoring/craft/validation/run/${json.runId}`);
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create run');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Pool status */}
      <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        <div style={{ background: '#EEF2F7', borderBottom: '1px solid #dde3ed', padding: '10px 24px' }}>
          <span style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#5a6a85', textTransform: 'uppercase', fontWeight: 700 }}>
            Validation Pool
          </span>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '32px' }}>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#1a1a1a' }}>
              {poolCount}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Articles in pool
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="number"
                min={1}
                max={2000}
                value={importCount}
                onChange={e => setImportCount(Math.max(1, Math.min(2000, Number(e.target.value))))}
                style={{ width: '90px', padding: '8px 10px', fontSize: '13px', border: '1px solid #dde3ed', borderRadius: '6px', fontFamily: 'inherit' }}
              />
              <button
                onClick={handleImport}
                disabled={importing}
                style={{ background: importing ? '#fda99e' : ACCENT, color: '#fff', border: 'none', borderRadius: '6px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: importing ? 'default' : 'pointer' }}
              >
                {importing ? 'Importing…' : 'Import articles'}
              </button>
              {importResult && <span style={{ fontSize: '12px', color: '#059669' }}>{importResult}</span>}
              {importError  && <span style={{ fontSize: '12px', color: '#b91c1c' }}>{importError}</span>}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
              Imports recent articles not already in the training pool.
            </div>
          </div>
        </div>
      </div>

      {/* Start new run */}
      <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        <div style={{ background: '#EEF2F7', borderBottom: '1px solid #dde3ed', padding: '10px 24px' }}>
          <span style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#5a6a85', textTransform: 'uppercase', fontWeight: 700 }}>
            Start New Validation Run
          </span>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {promptOptions.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              No scored prompts yet. Score a prompt version before running validation.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#5a6a85', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Prompt version
                </div>
                <select
                  value={selectedPrompt}
                  onChange={e => setSelectedPrompt(e.target.value)}
                  style={{ padding: '8px 10px', fontSize: '13px', border: '1px solid #dde3ed', borderRadius: '6px', fontFamily: 'inherit', minWidth: '140px' }}
                >
                  {promptOptions.map(o => (
                    <option key={o.id} value={o.id}>v{o.version}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#5a6a85', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Articles
                </div>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={nArticles}
                  onChange={e => setNArticles(Math.max(1, Math.min(50, Number(e.target.value))))}
                  style={{ width: '80px', padding: '8px 10px', fontSize: '13px', border: '1px solid #dde3ed', borderRadius: '6px', fontFamily: 'inherit' }}
                />
              </div>
              <button
                onClick={handleCreateRun}
                disabled={creating || !selectedPrompt || poolCount === 0}
                style={{ background: creating || !selectedPrompt || poolCount === 0 ? '#fda99e' : ACCENT, color: '#fff', border: 'none', borderRadius: '6px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: creating || !selectedPrompt || poolCount === 0 ? 'default' : 'pointer' }}
              >
                {creating ? 'Creating…' : 'Start run →'}
              </button>
              {createError && <span style={{ fontSize: '12px', color: '#b91c1c' }}>{createError}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
