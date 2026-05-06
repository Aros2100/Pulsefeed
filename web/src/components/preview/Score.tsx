import { C, F, CARD } from './tokens';

const DUMMY = { total: 8.4, evidence: 8.7, relevance: 7.4, clinical: 8.1, research: 7.9, news: 6.8 };

const DIMS: { key: keyof typeof DUMMY; label: string }[] = [
  { key: 'evidence',  label: 'Evidence'  },
  { key: 'relevance', label: 'Relevance' },
  { key: 'clinical',  label: 'Clinical'  },
  { key: 'research',  label: 'Research'  },
  { key: 'news',      label: 'News'      },
];

export default function Score() {
  return (
    <div style={{ ...CARD, position: 'relative', overflow: 'hidden', padding: '1.5rem 1.75rem' }}>
      {/* Red left rule */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', background: C.red }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '40px', alignItems: 'center' }}>

        {/* PulseScore */}
        <div style={{
          borderRight: `0.5px solid ${C.hairline}`,
          paddingRight: '40px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.red, fontWeight: 500, marginBottom: '6px', fontFamily: F.sans }}>
            PulseScore
          </div>
          <div style={{ fontFamily: F.serif, fontSize: '64px', lineHeight: 1, letterSpacing: '-0.03em', color: C.primary }}>
            {DUMMY.total.toFixed(1)}
          </div>
          <div style={{ fontSize: '10px', letterSpacing: '0.06em', color: C.tert, marginTop: '6px', fontFamily: F.sans }}>
            OF 10
          </div>
        </div>

        {/* 5 dimensions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '24px' }}>
          {DIMS.map(({ key, label }) => (
            <div key={key}>
              <div style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tert, marginBottom: '4px', fontFamily: F.sans }}>
                {label}
              </div>
              <div style={{ fontFamily: F.serif, fontSize: '24px', color: C.primary }}>
                {DUMMY[key].toFixed(1)}
              </div>
            </div>
          ))}
        </div>

      </div>

      <div style={{ textAlign: 'right', fontSize: '10px', fontStyle: 'italic', color: C.tert, marginTop: '14px', fontFamily: F.sans }}>
        Under development — dummy data
      </div>
    </div>
  );
}
