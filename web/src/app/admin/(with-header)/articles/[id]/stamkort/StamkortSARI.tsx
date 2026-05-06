import { COLORS, FONTS } from './tokens';

interface Props {
  subject:     string | null;
  action:      string | null;
  result:      string | null;
  implication: string | null;
}

interface CellProps {
  label:   string;
  content: string | null;
}

function SariCell({ label, content }: CellProps) {
  return (
    <div style={{
      padding: '14px 16px',
      minHeight: '80px',
      background: COLORS.slate50,
    }}>
      <div style={{
        fontSize: '10px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: COLORS.brandRed,
        fontFamily: FONTS.sans,
        marginBottom: '6px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '13px',
        color: content ? COLORS.slate700 : COLORS.slate400,
        fontFamily: FONTS.sans,
        lineHeight: 1.5,
      }}>
        {content ?? '—'}
      </div>
    </div>
  );
}

export default function StamkortSARI({ subject, action, result, implication }: Props) {
  return (
    <div style={{ background: '#fff', padding: '0 24px 16px' }}>
      <div style={{
        border: `1px solid ${COLORS.slate200}`,
        borderRadius: '8px',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
      }}>
        <div style={{ borderRight: `1px solid ${COLORS.slate200}`, borderBottom: `1px solid ${COLORS.slate200}` }}>
          <SariCell label="Subject"     content={subject} />
        </div>
        <div style={{ borderBottom: `1px solid ${COLORS.slate200}` }}>
          <SariCell label="Action"      content={action} />
        </div>
        <div style={{ borderRight: `1px solid ${COLORS.slate200}` }}>
          <SariCell label="Result"      content={result} />
        </div>
        <div>
          <SariCell label="Implication" content={implication} />
        </div>
      </div>
    </div>
  );
}
