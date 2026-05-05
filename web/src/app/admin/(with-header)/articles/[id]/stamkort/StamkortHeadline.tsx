"use client";

import { useState } from 'react';
import { COLORS, FONTS } from './tokens';
import LocationMap from './LocationMap';
import AuthorsModal from './AuthorsModal';
import AddressesModal from './AddressesModal';
import type { AuthorRow } from './AuthorsModal';
import type { AddressRow } from './AddressesModal';

export type { AuthorRow, AddressRow };

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtPublished(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

interface Props {
  articleType: string | null;
  shortHeadline: string | null;
  title: string | null;
  journalTitle: string | null;
  pubmedIndexedAt: string | null;
  pubmedId: string | null;
  authors: AuthorRow[];
  addresses: AddressRow[];
}

export default function StamkortHeadline({
  articleType,
  shortHeadline,
  title,
  journalTitle,
  pubmedIndexedAt,
  pubmedId,
  authors,
  addresses,
}: Props) {
  const [authorsOpen,   setAuthorsOpen]   = useState(false);
  const [addressesOpen, setAddressesOpen] = useState(false);

  const headline = shortHeadline ?? title ?? '—';
  const dateDisplay = fmtPublished(pubmedIndexedAt);
  const pubmedUrl = pubmedId ? `https://pubmed.ncbi.nlm.nih.gov/${pubmedId}/` : null;

  const firstAuthor    = authors[0] ?? null;
  const firstAuthorName = firstAuthor?.displayName ?? '—';
  const extraAuthors   = authors.length - 1;

  const primaryAddress     = addresses[0] ?? null;
  const primaryAddressText = primaryAddress
    ? [primaryAddress.department, primaryAddress.institution, primaryAddress.city, primaryAddress.country].filter(Boolean).join(', ')
    : '—';
  const extraAddresses = addresses.length - 1;

  const counterTag: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '11px',
    fontWeight: 600,
    color: COLORS.slate600,
    background: COLORS.slate100,
    border: `1px solid ${COLORS.slate200}`,
    borderRadius: '4px',
    padding: '1px 7px',
    cursor: 'pointer',
    fontFamily: FONTS.sans,
    marginLeft: '7px',
    flexShrink: 0,
    lineHeight: '18px',
  };

  return (
    <>
      <div style={{ background: '#fff', padding: '44px 24px 20px', position: 'relative' }}>

        {/* Article type — absolute top-right, touches top and right edge */}
        {articleType && (
          <span style={{
            position: 'absolute',
            top: 0,
            right: 0,
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: COLORS.brandRed,
            background: COLORS.brandRedTint,
            padding: '5px 10px',
            borderRadius: '0 0 0 6px',
            fontFamily: FONTS.sans,
          }}>
            {articleType}
          </span>
        )}

        {/* Headline */}
        <div style={{
          fontFamily: FONTS.serif,
          fontSize: '22px',
          fontWeight: 400,
          lineHeight: 1.35,
          color: COLORS.slate900,
          marginRight: articleType ? '96px' : 0,
          marginBottom: '10px',
        }}>
          {headline}
        </div>

        {/* Journal line */}
        <div style={{ fontSize: '12px', color: COLORS.slate500, fontFamily: FONTS.sans, marginBottom: '18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
          {journalTitle && <em>{journalTitle}</em>}
          {journalTitle && dateDisplay && <span>·</span>}
          {dateDisplay && <span>{dateDisplay}</span>}
          {pubmedUrl && (
            <>
              <span>·</span>
              <a
                href={pubmedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: COLORS.slate500, textDecoration: 'none' }}
              >
                {pubmedId}
              </a>
            </>
          )}
        </div>

        {/* Author + address / map */}
        <div style={{ borderTop: `1px solid ${COLORS.slate100}`, paddingTop: '16px', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Author line */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px', color: COLORS.slate700, marginBottom: '6px', fontFamily: FONTS.sans }}>
              {firstAuthor?.authorId ? (
                <a
                  href={`/authors/${firstAuthor.authorId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontWeight: 500, color: COLORS.slate700, textDecoration: 'none' }}
                >
                  {firstAuthorName}
                </a>
              ) : (
                <span style={{ fontWeight: 500 }}>{firstAuthorName}</span>
              )}
              {extraAuthors > 0 && (
                <button onClick={() => setAuthorsOpen(true)} style={counterTag}>
                  +{extraAuthors} authors
                </button>
              )}
            </div>
            {/* Address line */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px', color: COLORS.slate500, fontFamily: FONTS.sans }}>
              <span style={{ minWidth: 0 }}>{primaryAddressText}</span>
              {extraAddresses > 0 && (
                <button onClick={() => setAddressesOpen(true)} style={counterTag}>
                  +{extraAddresses} addresses
                </button>
              )}
            </div>
          </div>

          <div style={{ flexShrink: 0 }}>
            <LocationMap country={primaryAddress?.country ?? null} city={primaryAddress?.city ?? null} />
          </div>

        </div>
      </div>

      {authorsOpen   && <AuthorsModal   authors={authors}     onClose={() => setAuthorsOpen(false)} />}
      {addressesOpen && <AddressesModal addresses={addresses} onClose={() => setAddressesOpen(false)} />}
    </>
  );
}
