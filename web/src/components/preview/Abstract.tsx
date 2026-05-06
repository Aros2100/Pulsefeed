"use client";

import { useState } from 'react';
import { C, F, CARD, EYEBROW } from './tokens';

interface Props {
  abstract:          string | null;
  fullTextAvailable: boolean;
  pmcId:             string | null;
}

export default function Abstract({ abstract, fullTextAvailable, pmcId }: Props) {
  const [open, setOpen] = useState(false);
  if (!abstract) return null;

  const pmcUrl   = pmcId ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/` : null;
  const paragraphs = abstract.split(/\n\n+/).filter(Boolean);

  const fullTextLink = fullTextAvailable && pmcUrl ? (
    <a href={pmcUrl} target="_blank" rel="noopener noreferrer"
      style={{ fontSize: '12px', color: C.red, fontWeight: 500, textDecoration: 'none', fontFamily: F.sans }}>
      Full text on PMC →
    </a>
  ) : null;

  return (
    <div style={{ ...CARD, padding: open ? '1.5rem 1.75rem' : '1rem 1.75rem', cursor: 'pointer' }}
      onClick={() => setOpen(o => !o)}>

      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '24px', alignItems: 'center',
        paddingBottom: open ? '12px' : 0,
        borderBottom: open ? `0.5px solid ${C.hairline}` : 'none',
        marginBottom: open ? '18px' : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
          <span style={{ ...EYEBROW(C.red) }}>Original abstract</span>
          <span style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: '12px', color: C.sec }}>
            {open ? 'As published on PubMed' : 'Has abstract'}
          </span>
          <span style={{ fontSize: '14px', color: C.tert, fontFamily: F.sans }}>{open ? '↑' : '↓'}</span>
        </div>

        {fullTextLink && (
          <>
            <div style={{ width: '0.5px', height: '18px', background: C.hairline }} />
            <div onClick={e => e.stopPropagation()}>{fullTextLink}</div>
          </>
        )}
      </div>

      {/* Content */}
      {open && (
        <div onClick={e => e.stopPropagation()}>
          {paragraphs.map((p, i) => (
            <p key={i} style={{
              fontFamily: F.serif, fontSize: '14px', lineHeight: 1.65,
              color: C.primary, margin: i < paragraphs.length - 1 ? '0 0 14px' : 0,
            }}>
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
