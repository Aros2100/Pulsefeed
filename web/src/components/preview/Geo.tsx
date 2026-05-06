"use client";

import { useEffect, useState } from 'react';
import { geoMercator, geoPath, geoArea } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { C, F, CARD, EYEBROW, ISO2_TO_NUMERIC, iso2ToRegion } from './tokens';

interface Props {
  city:             string | null;
  country:          string | null;
  countryCode:      string | null; // ISO2 lowercase
  institution:      string | null;
  latitude:         number | null;
  longitude:        number | null;
  institutionCount: number;
  leadOrcid:        string | null;
}

type WorldTopo = Topology<{ countries: GeometryCollection }>;
let cachedAtlas: WorldTopo | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMainPolygon(f: any): any {
  if (f.geometry.type === 'Polygon') return f;
  if (f.geometry.type === 'MultiPolygon') {
    let best = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let coords: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const ring of f.geometry.coordinates as any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const area = geoArea({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: ring } } as any);
      if (area > best) { best = area; coords = ring; }
    }
    if (coords) return { ...f, geometry: { type: 'Polygon', coordinates: coords } };
  }
  return f;
}

const MAP_W = 232;
const MAP_H = 180;

export default function Geo({ city, country, countryCode, institution, latitude, longitude, institutionCount, leadOrcid }: Props) {
  const [atlas, setAtlas] = useState<WorldTopo | null>(cachedAtlas);

  useEffect(() => {
    if (cachedAtlas) return;
    fetch('/world-atlas/countries-50m.json')
      .then(r => r.json())
      .then((d: WorldTopo) => { cachedAtlas = d; setAtlas(d); })
      .catch(() => {});
  }, []);

  if (!city && !country) return null;

  // Build map
  let mapContent: React.ReactNode = null;
  if (atlas && countryCode) {
    const numericId = ISO2_TO_NUMERIC[countryCode.toLowerCase()];
    if (numericId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const countries = feature(atlas, atlas.objects.countries) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeFeature = countries.features.find((f: any) => String(f.id) === numericId);
      if (activeFeature) {
        const main = getMainPolygon(activeFeature);
        const proj = geoMercator().fitSize([MAP_W - 16, MAP_H - 16], main);
        const pg   = geoPath(proj);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bgPaths = countries.features.map((f: any, i: number) => ({ key: i, d: pg(f) })).filter((p: any) => p.d);
        const activePath = pg(main);

        let pinX: number | null = null;
        let pinY: number | null = null;
        if (latitude !== null && longitude !== null) {
          const pt = proj([longitude, latitude]);
          if (pt) { [pinX, pinY] = pt; }
        }

        mapContent = (
          <svg width={MAP_W} height={MAP_H} viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ display: 'block' }}>
            {bgPaths.map((p: { key: number; d: string }) => (
              <path key={p.key} d={p.d} fill="#DDE8EE" stroke="#B8CACF" strokeWidth={0.5} />
            ))}
            {activePath && <path d={activePath} fill="#B8D4E0" stroke="#7FA8B8" strokeWidth={0.8} />}
            {pinX !== null && pinY !== null && (
              <>
                <circle cx={pinX} cy={pinY} r={7}   fill={C.red} opacity={0.12} />
                <circle cx={pinX} cy={pinY} r={4}   fill={C.red} opacity={0.25} />
                <circle cx={pinX} cy={pinY} r={2}   fill={C.red} />
                {city && (
                  <text x={pinX} y={pinY + 13} textAnchor="middle"
                    fontFamily={F.serif} fontStyle="italic" fontSize={10} fill={C.primary}>
                    {city}
                  </text>
                )}
              </>
            )}
          </svg>
        );
      }
    }
  }

  const region = iso2ToRegion(countryCode);
  const cityCountry = [city, country].filter(Boolean).join(', ');

  return (
    <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', minHeight: '200px' }}>

        {/* Left — map */}
        <div style={{
          background: 'linear-gradient(135deg, #F0F7FA 0%, #E5EEF2 100%)',
          borderRight: `0.5px solid ${C.hairline}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}>
          {mapContent ?? (
            <div style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: '12px', color: C.tert }}>
              {cityCountry || 'Location unavailable'}
            </div>
          )}
        </div>

        {/* Right — info */}
        <div style={{ padding: '24px 28px' }}>
          <div style={{ ...EYEBROW(C.red), marginBottom: '10px' }}>Research origin</div>

          <div style={{ fontFamily: F.serif, fontSize: '22px', lineHeight: 1.25, color: C.primary, marginBottom: '4px' }}>
            {cityCountry || '—'}
          </div>

          {institution && (
            <div style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: '14px', color: C.sec, marginBottom: '18px' }}>
              {institution}
            </div>
          )}

          {/* Meta cells */}
          <div style={{ display: 'flex', gap: '32px', paddingTop: '14px', borderTop: `0.5px solid ${C.hairline}`, marginTop: institution ? 0 : '18px' }}>
            <MetaCell label="Region"       value={region ?? '—'} />
            <MetaCell label="Institutions" value={institutionCount > 0 ? String(institutionCount) : '—'} />
            <MetaCell label="Lead ORCID"   value={leadOrcid ?? '—'} mono />
          </div>
        </div>

      </div>
    </div>
  );
}

function MetaCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tert, marginBottom: '3px', fontFamily: F.sans }}>
        {label}
      </div>
      <div style={{ fontSize: '12px', color: C.sec, fontFamily: mono ? 'monospace' : F.sans }}>
        {value}
      </div>
    </div>
  );
}
