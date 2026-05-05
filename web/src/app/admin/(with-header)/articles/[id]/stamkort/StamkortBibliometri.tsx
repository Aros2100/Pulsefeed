import { COLORS, FONTS } from './tokens';

interface Props {
  impactFactor:  number | null;
  journalHIndex: number | null;
  citationCount: number | null;
  fwci:          number | null;
}

interface BoxProps {
  label: string;
  value: string;
}

function MetricBox({ label, value }: BoxProps) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${COLORS.slate200}`,
      borderRadius: '8px',
      padding: '12px 14px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '22px', fontWeight: 700, color: COLORS.slate900, fontFamily: FONTS.sans, lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: COLORS.slate500, fontFamily: FONTS.sans, marginTop: '4px' }}>
        {label}
      </div>
    </div>
  );
}

export default function StamkortBibliometri({ impactFactor, journalHIndex, citationCount, fwci }: Props) {
  return (
    <div style={{ background: COLORS.slate50, borderBottom: `1px solid ${COLORS.slate200}`, padding: '16px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        <MetricBox label="Impact factor"   value={impactFactor  != null ? impactFactor.toFixed(3)  : '—'} />
        <MetricBox label="Journal h-index" value={journalHIndex != null ? String(journalHIndex)     : '—'} />
        <MetricBox label="Citations"       value={citationCount != null ? String(citationCount)     : '—'} />
        <MetricBox label="FWCI"            value={fwci          != null ? fwci.toFixed(3)           : '—'} />
      </div>
    </div>
  );
}
