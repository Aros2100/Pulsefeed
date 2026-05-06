"use client";

import { useEffect, useState } from 'react';
import { geoMercator, geoPath, geoArea } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { ISO2_TO_NUMERIC } from './tokens';

interface Props {
  countryCode: string | null; // ISO2 lowercase, e.g. 'dk'
  latitude:    number | null;
  longitude:   number | null;
  size?:       number;
}

type WorldTopo = Topology<{ countries: GeometryCollection }>;

let cachedWorld: WorldTopo | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMainPolygon(f: any): any {
  if (f.geometry.type === 'Polygon') return f;
  if (f.geometry.type === 'MultiPolygon') {
    let bestArea = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let bestCoords: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const ring of f.geometry.coordinates as any[]) {
      const candidate = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: ring } };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const area = geoArea(candidate as any);
      if (area > bestArea) { bestArea = area; bestCoords = ring; }
    }
    if (bestCoords) return { ...f, geometry: { type: 'Polygon', coordinates: bestCoords } };
  }
  return f;
}

export default function LocationMap({ countryCode, latitude, longitude, size = 84 }: Props) {
  const [world, setWorld] = useState<WorldTopo | null>(cachedWorld);

  useEffect(() => {
    if (cachedWorld) return;
    fetch('/world-atlas/countries-50m.json')
      .then(r => r.json())
      .then((data: WorldTopo) => { cachedWorld = data; setWorld(data); })
      .catch(() => {});
  }, []);

  if (!world || !countryCode) return <Placeholder size={size} />;

  const numericId = ISO2_TO_NUMERIC[countryCode.toLowerCase()];
  if (!numericId) return <Placeholder size={size} />;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countries = feature(world, world.objects.countries) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeFeature = countries.features.find((f: any) => String(f.id) === numericId);
  if (!activeFeature) return <Placeholder size={size} />;

  // Fit projection to main territory only (avoids distant territories blowing the bounding box)
  const mainFeature = getMainPolygon(activeFeature);
  const inner       = size - 12;
  const projection  = geoMercator().fitSize([inner, inner], mainFeature);
  const pathGen     = geoPath(projection);

  // All country paths for context — rendered as background layer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bgPaths = countries.features.map((f: any, i: number) => ({ key: i, d: pathGen(f) })).filter((p: any) => p.d);
  const activePath = pathGen(mainFeature);

  let pinX: number | null = null;
  let pinY: number | null = null;
  if (latitude !== null && longitude !== null) {
    const pt = projection([longitude, latitude]);
    if (pt) { [pinX, pinY] = pt; }
  }

  return (
    <div style={{
      width: size, height: size,
      background: '#EDF5F8',
      border: '1px solid #E2E8F0',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <svg width={inner} height={inner} viewBox={`0 0 ${inner} ${inner}`} style={{ display: 'block' }}>
        {/* Neighbouring countries — muted background */}
        {bgPaths.map((p: { key: number; d: string }) => (
          <path key={p.key} d={p.d} fill="#E8EEF2" stroke="#CBD5E1" strokeWidth={0.4} />
        ))}
        {/* Active country — rendered on top with stronger colour */}
        {activePath && (
          <path d={activePath} fill="#CFE3EC" stroke="#94A3B8" strokeWidth={0.7} />
        )}
        {/* Pin */}
        {pinX !== null && pinY !== null && (
          <>
            <circle cx={pinX} cy={pinY} r={5}   fill="none"    stroke="#D94A43" strokeWidth={0.8} opacity={0.35} />
            <circle cx={pinX} cy={pinY} r={2.5} fill="#D94A43" />
          </>
        )}
      </svg>
    </div>
  );
}

function Placeholder({ size }: { size: number }) {
  const inner = size - 8;
  return (
    <div style={{
      width: size, height: size,
      background: '#EDF5F8',
      border: '1px solid #E2E8F0',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg viewBox="0 0 76 76" width={inner} height={inner}>
        <path
          d="M14 26 Q20 20 30 21 Q40 17 48 23 Q58 20 66 30 Q70 40 62 50 Q58 60 48 62 Q38 66 26 60 Q16 56 12 46 Q8 36 14 26 Z"
          fill="#CFE3EC" stroke="#94A3B8" strokeWidth="0.7"
        />
      </svg>
    </div>
  );
}
