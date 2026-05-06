import { C, F, CARD, EYEBROW } from './tokens';

interface Props {
  subject:     string | null;
  action:      string | null;
  result:      string | null;
  implication: string | null;
}

const CELLS: { key: keyof Props; label: string }[] = [
  { key: 'subject',     label: 'Subject'     },
  { key: 'action',      label: 'Action'      },
  { key: 'result',      label: 'Result'      },
  { key: 'implication', label: 'Implication' },
];

export default function Sari({ subject, action, result, implication }: Props) {
  const data = { subject, action, result, implication };
  const visible = CELLS.filter(c => data[c.key] !== null);
  if (visible.length === 0) return null;

  return (
    <div style={{ ...CARD, padding: '1.5rem 1.75rem' }}>
      <div style={{ ...EYEBROW(C.red), marginBottom: '18px' }}>SARI</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {visible.map(({ key, label }) => (
          <div key={key} style={{
            background: '#FAFBFC',
            border: '0.5px solid rgba(0,0,0,0.04)',
            borderRadius: '8px',
            padding: '14px 16px',
          }}>
            <div style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: '12px', color: C.tert, marginBottom: '6px' }}>
              {label}
            </div>
            <div style={{ fontSize: '14px', color: C.primary, lineHeight: 1.45, fontFamily: F.sans }}>
              {data[key]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
