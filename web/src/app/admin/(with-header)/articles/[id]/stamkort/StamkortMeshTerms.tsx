import { COLORS, FONTS } from './tokens';

export interface MeshTerm {
  descriptor?: string;
  major?:      boolean;
  qualifiers?: string[];
}

interface Props {
  meshTerms: MeshTerm[];
}

export default function StamkortMeshTerms({ meshTerms }: Props) {
  const sorted = [...meshTerms].sort((a, b) => {
    if (a.major && !b.major) return -1;
    if (!a.major && b.major) return  1;
    return 0;
  });

  return (
    <div style={{ background: '#fff', borderBottom: `1px solid ${COLORS.slate200}`, padding: '16px 24px' }}>
      <div style={{
        fontSize: '10px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: COLORS.brandRed,
        fontFamily: FONTS.sans,
        marginBottom: '10px',
      }}>
        MeSH terms
      </div>
      {sorted.length === 0 ? (
        <span style={{ fontSize: '13px', color: COLORS.slate400, fontFamily: FONTS.sans }}>—</span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {sorted.map((term, i) => {
            const descriptor = term.descriptor ?? '';
            const qualifiers = term.qualifiers ?? [];
            const isMajor    = !!term.major;

            return (
              <span key={`${descriptor}-${i}`} style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: '3px',
                fontSize: '12px',
                padding: '3px 9px',
                borderRadius: '4px',
                fontFamily: FONTS.sans,
                background: isMajor ? COLORS.brandRedTint : COLORS.slate100,
                color:      isMajor ? COLORS.brandRedDark : COLORS.slate700,
                border: `1px solid ${isMajor ? '#F9CECA' : COLORS.slate200}`,
              }}>
                <span style={{ fontWeight: isMajor ? 600 : 400 }}>{descriptor || '—'}</span>
                {isMajor && qualifiers.length > 0 && (
                  <span style={{ opacity: 0.7, fontSize: '11px' }}>
                    /{qualifiers.join('/')}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
