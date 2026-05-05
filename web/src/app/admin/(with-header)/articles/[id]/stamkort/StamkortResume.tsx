import { COLORS, FONTS } from './tokens';

interface Props {
  shortResume: string | null;
  bottomLine:  string | null;
}

export default function StamkortResume({ shortResume, bottomLine }: Props) {
  if (!shortResume && !bottomLine) return null;

  return (
    <div style={{ background: '#fff', borderBottom: `1px solid ${COLORS.slate200}`, padding: '0 24px 16px' }}>
      <div style={{
        background: COLORS.bgEditorial,
        border: `1px solid ${COLORS.bgEditorialBorder}`,
        borderRadius: '8px',
        padding: '20px',
      }}>
        {shortResume && (
          <div style={{
            fontSize: '14px',
            color: COLORS.slate600,
            fontFamily: FONTS.sans,
            lineHeight: 1.65,
            marginBottom: bottomLine ? '14px' : 0,
          }}>
            {shortResume}
          </div>
        )}
        {shortResume && bottomLine && (
          <div style={{ borderTop: `1px solid ${COLORS.bgEditorialBorder}`, marginBottom: '14px' }} />
        )}
        {bottomLine && (
          <div style={{
            fontSize: '14px',
            fontWeight: 500,
            color: COLORS.slate900,
            fontFamily: FONTS.sans,
            lineHeight: 1.65,
          }}>
            {bottomLine}
          </div>
        )}
      </div>
    </div>
  );
}
