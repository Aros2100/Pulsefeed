import { C, F, CARD, EYEBROW, fmtDateLong, countryToIso2 } from './tokens';

interface Props {
  specialty:      string | null;
  articleType:    string | null;
  subspecialties: string[];
  headline:       string;
  originalTitle:  string | null; // shown only when short_headline was used
  journalAbbr:    string | null;
  publishedDate:  string | null;
  pubmedId:       string | null;
  primaryCountry: string | null;
}

export default function PreviewHeader({
  specialty, articleType, subspecialties, headline, originalTitle,
  journalAbbr, publishedDate, pubmedId, primaryCountry,
}: Props) {
  const iso2       = countryToIso2(primaryCountry);
  const dateDisplay = fmtDateLong(publishedDate);

  return (
    <div style={{ ...CARD, padding: '1.5rem 1.75rem' }}>

      {/* Line 1 — tags row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '18px', alignItems: 'baseline' }}>
          {specialty && (
            <span style={{ ...EYEBROW(C.red), letterSpacing: '0.14em', fontWeight: 500 }}>
              {specialty.charAt(0).toUpperCase() + specialty.slice(1).replace(/-/g, ' ')}
            </span>
          )}
          {articleType && (
            <span style={{ ...EYEBROW(), fontSize: '10px', letterSpacing: '0.1em' }}>
              {articleType}
            </span>
          )}
        </div>

        {/* Country pill */}
        {primaryCountry && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: C.bg, padding: '5px 12px', borderRadius: '999px',
          }}>
            {iso2 && (
              <span
                className={`fi fi-${iso2}`}
                style={{ width: '18px', height: '12px', display: 'inline-block', borderRadius: '2px', flexShrink: 0 }}
              />
            )}
            <span style={{ fontSize: '11px', color: C.sec, fontFamily: F.sans }}>
              {primaryCountry}
            </span>
          </div>
        )}
      </div>

      {/* Line 2 — subspecialties */}
      {subspecialties.length > 0 && (
        <div style={{
          display: 'flex', gap: '10px', alignItems: 'baseline',
          paddingBottom: '14px', borderBottom: `0.5px solid ${C.hairline}`,
          marginBottom: '20px',
        }}>
          {subspecialties.map((sub, i) => (
            <span key={sub} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '10px' }}>
              {i > 0 && <span style={{ fontSize: '11px', color: C.tert, fontFamily: F.sans }}>·</span>}
              <span style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: '14px', color: C.sec }}>
                {sub}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Headline */}
      <div style={{
        fontFamily: F.serif, fontSize: '24px', lineHeight: 1.3,
        letterSpacing: '-0.005em', color: C.primary, marginBottom: '8px',
      }}>
        {headline}
      </div>

      {/* PubMed original title — only if short_headline was used */}
      {originalTitle && (
        <div style={{ fontSize: '10px', color: C.tert, lineHeight: 1.5, marginBottom: '14px', fontFamily: F.sans }}>
          <span style={{ fontStyle: 'normal', letterSpacing: '0.06em' }}>PUBMED: </span>
          <em>{originalTitle}</em>
        </div>
      )}

      {/* Meta line */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'baseline', flexWrap: 'wrap' }}>
        {journalAbbr && (
          <span style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: '12px', color: C.sec }}>
            {journalAbbr}
          </span>
        )}
        {journalAbbr && dateDisplay && <span style={{ fontSize: '12px', color: C.tert, fontFamily: F.sans }}>·</span>}
        {dateDisplay && (
          <span style={{ fontSize: '12px', color: C.sec, fontFamily: F.sans }}>{dateDisplay}</span>
        )}
        {pubmedId && (
          <>
            <span style={{ fontSize: '12px', color: C.tert, fontFamily: F.sans }}>·</span>
            <span style={{ fontSize: '11px', color: C.tert, fontFamily: F.sans }}>PMID {pubmedId}</span>
          </>
        )}
      </div>

    </div>
  );
}
