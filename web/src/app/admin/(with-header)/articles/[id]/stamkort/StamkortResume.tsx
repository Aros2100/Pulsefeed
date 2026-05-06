import { FONTS } from './tokens';

interface Props {
  shortResume: string | null;
  bottomLine:  string | null;
}

const eyebrow: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#D94A43',
  letterSpacing: '2.5px',
  textTransform: 'uppercase',
  marginBottom: '10px',
  fontFamily: FONTS.sans,
};

export default function StamkortResume({ shortResume, bottomLine }: Props) {
  if (!shortResume && !bottomLine) return null;

  return (
    <div style={{ padding: '0 24px 22px' }}>
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E5DCC8',
        borderRadius: '8px',
        padding: '20px',
      }}>
        <div style={eyebrow}>Short resume</div>
        <p style={{ fontSize: '14px', lineHeight: 1.65, margin: 0, color: '#475569', fontFamily: FONTS.sans }}>
          {shortResume ?? '—'}
        </p>

        <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '18px', paddingTop: '18px' }}>
          <div style={eyebrow}>Bottom line</div>
          <p style={{ fontSize: '14px', lineHeight: 1.65, margin: 0, color: '#1E293B', fontWeight: 500, fontFamily: FONTS.sans }}>
            {bottomLine ?? '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
