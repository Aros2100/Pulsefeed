"use client";

import { useState } from 'react';
import { COLORS, FONTS } from './tokens';

interface Grant     { grantId?: string | null; agency?: string | null }
interface Substance { registryNumber?: string | null; name?: string | null }

interface Props {
  volume:           string | null;
  issue:            string | null;
  doi:              string | null;
  meshTermsText:    string | null;
  keywords:         string[] | null;
  grants:           Grant[] | null;
  coiStatement:     string | null;
  substances:       Substance[] | null;
  language:         string | null;
  publicationTypes: string[] | null;
  issnElectronic:   string | null;
  issnPrint:        string | null;
  articleNumber:    string | null;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '6px 0', borderBottom: `1px solid ${COLORS.slate100}`, fontSize: '13px', fontFamily: FONTS.sans }}>
      <span style={{ color: COLORS.slate500, minWidth: '160px', flexShrink: 0 }}>{label}</span>
      <span style={{ color: COLORS.slate700 }}>{value}</span>
    </div>
  );
}

export default function StamkortPubmedDrawer({
  volume, issue, doi, meshTermsText, keywords, grants,
  coiStatement, substances, language, publicationTypes,
  issnElectronic, issnPrint, articleNumber,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ padding: '0 24px 4px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none',
          border: `1px solid ${COLORS.slate200}`,
          borderRadius: '6px',
          padding: '7px 14px',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: COLORS.slate500,
          cursor: 'pointer',
          fontFamily: FONTS.sans,
        }}
      >
        {open ? 'Hide additional PubMed fields ↑' : 'Show additional PubMed fields ↓'}
      </button>

      {open && (
        <div style={{ marginTop: '12px', paddingBottom: '8px' }}>
          <Row label="Volume"            value={volume} />
          <Row label="Issue"             value={issue} />
          <Row label="Article number"    value={articleNumber} />
          <Row label="DOI"               value={doi} />
          <Row label="ISSN (electronic)" value={issnElectronic} />
          <Row label="ISSN (print)"      value={issnPrint} />
          <Row label="Language"          value={language} />
          <Row
            label="Publication types"
            value={publicationTypes && publicationTypes.length > 0
              ? publicationTypes.join(', ')
              : null}
          />
          <Row
            label="Keywords"
            value={keywords && keywords.length > 0
              ? keywords.join('; ')
              : null}
          />
          <Row label="MeSH terms (text)" value={meshTermsText} />
          <Row
            label="Grants"
            value={grants && grants.length > 0
              ? grants.map(g => [g.agency, g.grantId].filter(Boolean).join(' ')).join('; ')
              : null}
          />
          <Row
            label="Substances"
            value={substances && substances.length > 0
              ? substances.map(s => s.name ?? s.registryNumber).filter(Boolean).join(', ')
              : null}
          />
          <Row label="COI statement" value={coiStatement} />
        </div>
      )}
    </div>
  );
}
