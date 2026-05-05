import { COLORS, FONTS } from './tokens';

export interface Scores {
  evidence:  number;
  relevance: number;
  clinical:  number;
  research:  number;
  news:      number;
}

const DUMMY_SCORES: Scores = {
  evidence:  8.7,
  relevance: 7.4,
  clinical:  8.1,
  research:  7.9,
  news:      6.8,
};

const LABELS: { key: keyof Scores; label: string }[] = [
  { key: 'evidence',  label: 'Evidence'  },
  { key: 'relevance', label: 'Relevance' },
  { key: 'clinical',  label: 'Clinical'  },
  { key: 'research',  label: 'Research'  },
  { key: 'news',      label: 'News'      },
];

interface Props {
  scores?: Scores | null;
}

export default function StamkortScoring({ scores }: Props) {
  const data = scores ?? DUMMY_SCORES;
  const isDummy = !scores;

  return (
    <div style={{ background: '#fff', borderBottom: `1px solid ${COLORS.slate200}`, padding: '0 24px 16px' }}>
      <div style={{
        background: COLORS.slate50,
        border: `1px solid ${COLORS.slate200}`,
        borderRadius: '8px',
        overflow: 'hidden',
        padding: '4px',
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
      }}>
        {LABELS.map(({ key, label }, i) => (
          <div key={key} style={{
            padding: '14px 14px',
            textAlign: 'center',
            borderRight: i < LABELS.length - 1 ? `1px solid ${COLORS.slate200}` : 'none',
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: COLORS.slate900, fontFamily: FONTS.sans, lineHeight: 1.1 }}>
              {data[key].toFixed(1)}
            </div>
            <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: COLORS.slate500, fontFamily: FONTS.sans, marginTop: '4px' }}>
              {label}
            </div>
          </div>
        ))}
      </div>
      {isDummy && (
        <div style={{ textAlign: 'right', marginTop: '8px', fontSize: '11px', fontStyle: 'italic', color: COLORS.slate400, fontFamily: FONTS.sans }}>
          Under development — dummy data
        </div>
      )}
    </div>
  );
}
