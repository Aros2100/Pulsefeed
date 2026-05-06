import { COLORS, FONTS, countryToIso2 } from './tokens';

interface Props {
  specialties: string[];
  currentSpecialty: string;
  subspecialties: string[];
  primaryCountry: string | null;
}

function specialtyLabel(slug: string) {
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');
}

export default function StamkortHeader({ specialties, currentSpecialty, subspecialties, primaryCountry }: Props) {
  const iso2        = countryToIso2(primaryCountry);
  const otherCount  = specialties.filter(s => s !== currentSpecialty).length;
  const displaySubs = subspecialties.slice(0, 3);

  const eyebrow: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontFamily: FONTS.sans,
  };

  return (
    <div style={{ background: COLORS.slate50, borderBottom: `1px solid ${COLORS.slate200}`, padding: '12px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '30% 40% 30%', gap: '12px', alignItems: 'start' }}>

        {/* Left — current specialty + counter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          <span style={{ ...eyebrow, color: COLORS.brandRed }}>
            {specialtyLabel(currentSpecialty)}
          </span>
          {otherCount > 0 && (
            <span style={{ fontSize: '11px', color: COLORS.slate500, fontFamily: FONTS.sans }}>
              +{otherCount} spec.
            </span>
          )}
        </div>

        {/* Middle — subspecialty tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {displaySubs.length > 0 ? displaySubs.map(sub => (
            <span key={sub} style={{
              fontSize: '11px',
              background: COLORS.slate100,
              color: COLORS.slate700,
              padding: '2px 8px',
              borderRadius: '4px',
              fontFamily: FONTS.sans,
            }}>
              {sub}
            </span>
          )) : null}
        </div>

        {/* Right — placeholder + country tag */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
          <span style={{
            fontSize: '11px',
            color: COLORS.slate400,
            border: `1px dashed ${COLORS.slate300}`,
            padding: '2px 8px',
            borderRadius: '4px',
            fontFamily: FONTS.sans,
            fontStyle: 'italic',
          }}>
            #placeholder
          </span>
          {iso2 && (
            <span
              className={`fi fi-${iso2}`}
              title={primaryCountry ?? undefined}
              style={{
                width: '24px',
                height: '18px',
                borderRadius: '2px',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
          )}
        </div>

      </div>
    </div>
  );
}
