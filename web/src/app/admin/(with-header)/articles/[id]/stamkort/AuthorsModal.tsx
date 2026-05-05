"use client";

import { COLORS, FONTS } from './tokens';

export interface AuthorRow {
  position: number;
  authorId: string | null;
  displayName: string | null;
}

interface Props {
  authors: AuthorRow[];
  onClose: () => void;
}

export default function AuthorsModal({ authors, onClose }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(30, 41, 59, 0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          width: '480px',
          maxHeight: '480px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${COLORS.slate200}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: COLORS.slate900, fontFamily: FONTS.sans }}>
            Authors · {authors.length} total
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: COLORS.slate400,
              fontSize: '20px',
              lineHeight: 1,
              padding: '0 4px',
              fontFamily: FONTS.sans,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '8px 0' }}>
          {authors.map((author) => {
            const name = author.displayName ?? '—';
            return (
              <div key={author.position} style={{
                padding: '9px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                borderBottom: `1px solid ${COLORS.slate100}`,
              }}>
                <span style={{ fontSize: '12px', color: COLORS.slate400, minWidth: '22px', fontFamily: FONTS.sans, textAlign: 'right' }}>
                  {author.position}
                </span>
                {author.authorId ? (
                  <a
                    href={`/authors/${author.authorId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '13px', fontWeight: 500, color: COLORS.brandRed, textDecoration: 'none', fontFamily: FONTS.sans }}
                  >
                    {name}
                  </a>
                ) : (
                  <span style={{ fontSize: '13px', color: COLORS.slate700, fontFamily: FONTS.sans }}>
                    {name}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
