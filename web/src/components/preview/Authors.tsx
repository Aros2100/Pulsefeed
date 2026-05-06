import { C, F, CARD, EYEBROW } from './tokens';

interface AuthorRaw {
  lastName?:   string;
  foreName?:   string;
  orcid?:      string | null;
}

interface Props {
  authors: AuthorRaw[];
}

function formatName(a: AuthorRaw): string {
  return [a.foreName, a.lastName].filter(Boolean).join(' ') || '—';
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: '11px', color: C.tert, padding: '2px 8px',
      background: C.bg, borderRadius: '999px', fontFamily: F.sans,
    }}>
      {children}
    </span>
  );
}

export default function Authors({ authors }: Props) {
  if (authors.length === 0) return null;

  const first  = authors[0];
  const senior = authors.length > 1 ? authors[authors.length - 1] : null;
  // co-authors are everyone between first and senior (exclusive)
  const coAuthors = authors.length > 2 ? authors.slice(1, -1) : [];

  // Show at most 6 co-authors inline, then pill
  const MAX_SHOWN = 6;
  const shownCo   = coAuthors.slice(0, MAX_SHOWN);
  const extraCo   = coAuthors.length - shownCo.length;

  return (
    <div style={{ ...CARD, padding: '1.5rem 1.75rem' }}>
      <div style={{ ...EYEBROW(), marginBottom: '14px' }}>Authors</div>

      {/* First + senior */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: F.serif, fontSize: '17px', color: C.primary }}>{formatName(first)}</span>
        <Pill>first</Pill>
        {senior && (
          <>
            <span style={{ fontSize: '11px', color: C.tert, margin: '0 4px', fontFamily: F.sans }}>···</span>
            <span style={{ fontFamily: F.serif, fontSize: '17px', color: C.primary }}>{formatName(senior)}</span>
            <Pill>senior</Pill>
          </>
        )}
      </div>

      {/* Co-authors */}
      {coAuthors.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: '8px',
          paddingTop: '8px', borderTop: `0.5px solid ${C.hairline}`,
          overflow: 'hidden',
        }}>
          <span style={{ fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tert, fontFamily: F.sans, flexShrink: 0 }}>
            Co-authors:
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0, overflow: 'hidden', flexWrap: 'nowrap' }}>
            {shownCo.map((a, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '8px', flexShrink: 0 }}>
                {i > 0 && <span style={{ fontSize: '11px', color: C.tert, fontFamily: F.sans }}>·</span>}
                <span style={{ fontFamily: F.serif, fontSize: '14px', color: C.sec, whiteSpace: 'nowrap' }}>
                  {formatName(a)}
                </span>
              </span>
            ))}
          </div>
          {extraCo > 0 && (
            <span style={{
              fontSize: '12px', color: C.tert, padding: '2px 8px',
              border: `0.5px solid ${C.hairline}`, borderRadius: '999px',
              flexShrink: 0, fontFamily: F.sans,
            }}>
              +{extraCo} more →
            </span>
          )}
        </div>
      )}
    </div>
  );
}
