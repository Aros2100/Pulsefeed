import { C, F, CARD, EYEBROW } from './tokens';

interface MeshTerm {
  descriptor?: string;
  major?:      boolean;
  qualifiers?: string[];
}

interface Props {
  meshTerms: MeshTerm[];
}

export default function MeshTerms({ meshTerms }: Props) {
  if (!meshTerms.length) return null;

  const major  = meshTerms.filter(t => t.major);
  const normal = meshTerms.filter(t => !t.major);

  return (
    <div style={{ ...CARD, padding: '1.5rem 1.75rem' }}>
      <div style={{ ...EYEBROW(C.red), marginBottom: '14px' }}>MeSH terms</div>

      {/* Major terms */}
      {major.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {major.map((t, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'baseline', gap: '6px',
              padding: '6px 12px', background: 'rgba(217,74,67,0.08)',
              border: '0.5px solid rgba(217,74,67,0.2)', borderRadius: '999px',
            }}>
              <span style={{ fontSize: '13px', color: C.red, fontWeight: 600, fontFamily: F.sans }}>
                {t.descriptor ?? '—'}
              </span>
              {(t.qualifiers ?? []).length > 0 && (
                <span style={{ fontSize: '11px', color: 'rgba(217,74,67,0.7)', fontFamily: F.sans }}>
                  /{(t.qualifiers ?? []).join('/')}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Non-major terms */}
      {normal.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'baseline' }}>
          <span style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tert, marginRight: '4px', fontFamily: F.sans }}>
            Also:
          </span>
          {normal.map((t, i) => (
            <span key={i} style={{
              padding: '3px 9px', background: '#F7F8FA', borderRadius: '999px',
              fontSize: '11px', color: C.sec, fontFamily: F.sans,
            }}>
              {t.descriptor ?? '—'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
