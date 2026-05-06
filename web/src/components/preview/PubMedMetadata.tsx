"use client";

import { useState } from 'react';
import { C, F, CARD, EYEBROW, fmtDateLong } from './tokens';

interface Props {
  pubmedId:         string | null;
  doi:              string | null;
  pmcId:            string | null;
  fullTextAvail:    boolean | null;
  volume:           string | null;
  issue:            string | null;
  articleNumber:    string | null;
  issnElectronic:   string | null;
  issnPrint:        string | null;
  language:         string | null;
  publicationTypes: string[] | null;
  retracted:        boolean | null;
  publishedDate:    string | null;
  pubmedIndexedAt:  string | null;
  dateCompleted:    string | null;
  pubmedModifiedAt: string | null;
  impactFactor:     number | null;
  journalHIndex:    number | null;
  citationCount:    number | null;
  fwci:             number | null;
  sampleSize:       number | null;
  patientPop:       string | null;
  trialReg:         string | null;
  timeToRead:       number | null;
  keywords:         string[] | null;
  grants:           unknown[] | null;
  substances:       unknown[] | null;
  coiStatement:     string | null;
}

const NULL  = <span style={{ color: 'rgba(0,0,0,0.25)', fontFamily: 'monospace' }}>— null</span>;
const EMPTY = <span style={{ color: 'rgba(0,0,0,0.25)', fontFamily: 'monospace' }}>— empty array</span>;

function val(v: unknown, fmt?: (x: unknown) => string): React.ReactNode {
  if (v === null || v === undefined) return NULL;
  if (Array.isArray(v)) return v.length === 0 ? EMPTY : (fmt ? fmt(v) : v.join(', '));
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return fmt ? fmt(v) : String(v);
}

function FieldCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: C.tert, marginBottom: '2px', fontFamily: F.sans, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '13px', color: C.primary, fontFamily: F.sans }}>{children}</div>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tert, fontFamily: F.sans, marginBottom: '8px', marginTop: '20px' }}>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px 24px' }}>{children}</div>;
}

const TRACKED_TOTAL = 24;

export default function PubMedMetadata(props: Props) {
  const [open, setOpen] = useState(false);

  const allVals = [
    props.pubmedId, props.doi, props.pmcId, props.fullTextAvail,
    props.volume, props.issue, props.articleNumber, props.issnElectronic, props.issnPrint, props.language, props.publicationTypes, props.retracted,
    props.publishedDate, props.pubmedIndexedAt, props.dateCompleted, props.pubmedModifiedAt,
    props.impactFactor, props.journalHIndex, props.citationCount, props.fwci,
    props.sampleSize, props.patientPop, props.trialReg, props.timeToRead,
  ];
  const populated = allVals.filter(v => v !== null && v !== undefined).length;

  return (
    <div style={{ ...CARD, padding: open ? '1.5rem 1.75rem' : '1rem 1.75rem', cursor: 'pointer' }}
      onClick={() => setOpen(o => !o)}>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        paddingBottom: open ? '12px' : 0,
        borderBottom: open ? `0.5px solid ${C.hairline}` : 'none',
        marginBottom: open ? '4px' : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
          <span style={{ ...EYEBROW() }}>PubMed metadata</span>
          <span style={{ fontFamily: F.sans, fontStyle: 'italic', fontSize: '11px', color: C.sec }}>
            Internal field check · {populated} of {TRACKED_TOTAL} populated
          </span>
        </div>
        <span style={{ fontSize: '14px', color: C.tert, fontFamily: F.sans }}>{open ? '↑' : '↓'}</span>
      </div>

      {open && (
        <div onClick={e => e.stopPropagation()}>
          <GroupLabel>Identifiers</GroupLabel>
          <Grid>
            <FieldCell label="PMID">{val(props.pubmedId)}</FieldCell>
            <FieldCell label="DOI">{val(props.doi)}</FieldCell>
            <FieldCell label="PMC ID">{val(props.pmcId)}</FieldCell>
            <FieldCell label="Full text">{val(props.fullTextAvail)}</FieldCell>
          </Grid>

          <GroupLabel>Journal</GroupLabel>
          <Grid>
            <FieldCell label="Volume">{val(props.volume)}</FieldCell>
            <FieldCell label="Issue">{val(props.issue)}</FieldCell>
            <FieldCell label="Article №">{val(props.articleNumber)}</FieldCell>
            <FieldCell label="ISSN-E">{val(props.issnElectronic)}</FieldCell>
            <FieldCell label="ISSN-P">{val(props.issnPrint)}</FieldCell>
            <FieldCell label="Language">{val(props.language)}</FieldCell>
            <FieldCell label="Pub types">{val(props.publicationTypes, v => (v as string[]).join(', '))}</FieldCell>
            <FieldCell label="Retracted">{val(props.retracted)}</FieldCell>
          </Grid>

          <GroupLabel>Dates</GroupLabel>
          <Grid>
            <FieldCell label="Published">{val(props.publishedDate, v => fmtDateLong(v as string) ?? String(v))}</FieldCell>
            <FieldCell label="PubMed indexed">{val(props.pubmedIndexedAt, v => fmtDateLong(v as string) ?? String(v))}</FieldCell>
            <FieldCell label="Completed">{val(props.dateCompleted, v => fmtDateLong(v as string) ?? String(v))}</FieldCell>
            <FieldCell label="Modified">{val(props.pubmedModifiedAt, v => fmtDateLong(v as string) ?? String(v))}</FieldCell>
          </Grid>

          <GroupLabel>Metrics</GroupLabel>
          <Grid>
            <FieldCell label="Impact factor">{val(props.impactFactor, v => (v as number).toFixed(3))}</FieldCell>
            <FieldCell label="Journal h-index">{val(props.journalHIndex)}</FieldCell>
            <FieldCell label="Citations">{val(props.citationCount)}</FieldCell>
            <FieldCell label="FWCI">{val(props.fwci, v => (v as number).toFixed(3))}</FieldCell>
          </Grid>

          <GroupLabel>Clinical data</GroupLabel>
          <Grid>
            <FieldCell label="Sample size">{val(props.sampleSize)}</FieldCell>
            <FieldCell label="Patient pop.">{val(props.patientPop)}</FieldCell>
            <FieldCell label="Trial reg.">{val(props.trialReg)}</FieldCell>
            <FieldCell label="Time to read">{val(props.timeToRead, v => `${v} min`)}</FieldCell>
          </Grid>

          <GroupLabel>Content</GroupLabel>
          {props.keywords && props.keywords.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              <span style={{ fontSize: '10px', color: C.tert, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px', fontFamily: F.sans, alignSelf: 'center' }}>
                Keywords:
              </span>
              {props.keywords.map((k, i) => (
                <span key={i} style={{ fontSize: '11px', color: C.sec, padding: '2px 8px', background: '#F7F8FA', borderRadius: '999px', fontFamily: F.sans }}>
                  {k}
                </span>
              ))}
            </div>
          )}
          <Grid>
            <FieldCell label="Grants">{val(props.grants, v => `${(v as unknown[]).length} grant(s)`)}</FieldCell>
            <FieldCell label="Substances">{val(props.substances, v => `${(v as unknown[]).length} substance(s)`)}</FieldCell>
          </Grid>
          {props.coiStatement && (
            <div style={{ borderTop: `0.5px solid ${C.hairline}`, marginTop: '14px', paddingTop: '14px' }}>
              <div style={{ fontSize: '10px', color: C.tert, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: F.sans }}>
                COI statement
              </div>
              <p style={{ fontFamily: F.sans, fontStyle: 'italic', fontSize: '12px', color: C.sec, lineHeight: 1.55, margin: 0 }}>
                {props.coiStatement}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
