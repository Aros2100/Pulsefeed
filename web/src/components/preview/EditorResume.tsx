import { C, F } from './tokens';

interface Props {
  shortResume: string | null;
  bottomLine:  string | null;
}

export default function EditorResume({ shortResume, bottomLine }: Props) {
  if (!shortResume && !bottomLine) return null;

  return (
    <div style={{
      background:    C.cream,
      borderRadius:  '12px',
      border:        '0.5px solid rgba(0,0,0,0.06)',
      padding:       '1.5rem 1.75rem',
      position:      'relative',
      overflow:      'hidden',
      marginBottom:  '1rem',
    }}>
      {/* Red left rule */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', background: C.red }} />

      <div style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: '14px', color: C.red, marginBottom: '12px' }}>
        Editor&apos;s resume
      </div>

      {shortResume && (
        <p style={{ fontFamily: F.serif, fontSize: '15px', lineHeight: 1.6, color: C.primary, margin: '0 0 16px' }}>
          {shortResume}
        </p>
      )}

      {shortResume && bottomLine && (
        <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.1)', margin: '14px 0' }} />
      )}

      {bottomLine && (
        <>
          <div style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.red, fontWeight: 500, marginBottom: '8px', fontFamily: F.sans }}>
            Bottom line
          </div>
          <p style={{ fontFamily: F.serif, fontSize: '15px', lineHeight: 1.55, color: C.primary, fontWeight: 700, margin: 0 }}>
            {bottomLine}
          </p>
        </>
      )}
    </div>
  );
}
