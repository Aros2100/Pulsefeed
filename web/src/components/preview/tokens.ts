export const C = {
  red:      '#D94A43',
  primary:  '#1E293B',
  sec:      '#475569',
  tert:     '#94A3B8',
  bg:       '#EDF5F8',
  cream:    '#F5F1E8',
  white:    '#FFFFFF',
  hairline: 'rgba(0,0,0,0.08)',
} as const;

export const F = {
  serif: "Georgia, 'Times New Roman', serif",
  sans:  "'Helvetica Neue', Helvetica, Arial, sans-serif",
} as const;

export const CARD: React.CSSProperties = {
  background:   '#FFFFFF',
  borderRadius: '12px',
  border:       '0.5px solid rgba(0,0,0,0.06)',
  marginBottom: '1rem',
};

export const EYEBROW = (color: string = C.tert): React.CSSProperties => ({
  fontSize:      '10px',
  fontWeight:    500,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color,
  fontFamily:    F.sans,
});

const COUNTRY_ISO2: Record<string, string> = {
  'Afghanistan': 'af', 'Albania': 'al', 'Algeria': 'dz', 'Argentina': 'ar',
  'Australia': 'au', 'Austria': 'at', 'Belgium': 'be', 'Brazil': 'br',
  'Canada': 'ca', 'Chile': 'cl', 'China': 'cn', 'Colombia': 'co',
  'Croatia': 'hr', 'Czech Republic': 'cz', 'Czechia': 'cz',
  'Denmark': 'dk', 'Egypt': 'eg', 'Finland': 'fi', 'France': 'fr',
  'Germany': 'de', 'Greece': 'gr', 'Hong Kong': 'hk', 'Hungary': 'hu',
  'Iceland': 'is', 'India': 'in', 'Indonesia': 'id', 'Iran': 'ir',
  'Iraq': 'iq', 'Ireland': 'ie', 'Israel': 'il', 'Italy': 'it',
  'Japan': 'jp', 'Jordan': 'jo', 'Malaysia': 'my', 'Mexico': 'mx',
  'Morocco': 'ma', 'Netherlands': 'nl', 'New Zealand': 'nz', 'Nigeria': 'ng',
  'Norway': 'no', 'Pakistan': 'pk', 'Philippines': 'ph', 'Poland': 'pl',
  'Portugal': 'pt', 'Romania': 'ro', 'Russia': 'ru', 'Saudi Arabia': 'sa',
  'Singapore': 'sg', 'Slovakia': 'sk', 'Slovenia': 'si', 'South Africa': 'za',
  'South Korea': 'kr', 'Spain': 'es', 'Sweden': 'se', 'Switzerland': 'ch',
  'Taiwan': 'tw', 'Thailand': 'th', 'Tunisia': 'tn', 'Turkey': 'tr',
  'Ukraine': 'ua', 'United Arab Emirates': 'ae', 'United Kingdom': 'gb',
  'United States': 'us', 'Uruguay': 'uy', 'Vietnam': 'vn',
};

export function countryToIso2(country: string | null): string | null {
  if (!country) return null;
  return COUNTRY_ISO2[country] ?? null;
}

const ISO2_REGION: Record<string, string> = {
  us:'North America', ca:'North America', mx:'North America',
  br:'South America', ar:'South America', cl:'South America', co:'South America', uy:'South America',
  gb:'Europe', de:'Europe', fr:'Europe', it:'Europe', es:'Europe', nl:'Europe', be:'Europe',
  ch:'Europe', at:'Europe', se:'Europe', no:'Europe', dk:'Europe', fi:'Europe', is:'Europe',
  ie:'Europe', pl:'Europe', pt:'Europe', gr:'Europe', ro:'Europe', hr:'Europe',
  cz:'Europe', sk:'Europe', si:'Europe', hu:'Europe', ua:'Europe', ru:'Europe',
  cn:'East Asia', jp:'East Asia', kr:'East Asia', tw:'East Asia', hk:'East Asia',
  in:'South Asia', pk:'South Asia',
  sg:'Southeast Asia', th:'Southeast Asia', vn:'Southeast Asia', my:'Southeast Asia',
  id:'Southeast Asia', ph:'Southeast Asia',
  au:'Oceania', nz:'Oceania',
  il:'Middle East', sa:'Middle East', ae:'Middle East', ir:'Middle East',
  iq:'Middle East', jo:'Middle East',
  eg:'North Africa', ma:'North Africa', tn:'North Africa',
  ng:'Sub-Saharan Africa', za:'Sub-Saharan Africa',
  tr:'Middle East / Europe',
};

export function iso2ToRegion(iso2: string | null): string | null {
  if (!iso2) return null;
  return ISO2_REGION[iso2.toLowerCase()] ?? null;
}

export const ISO2_TO_NUMERIC: Record<string, string> = {
  af:'004', al:'008', dz:'012', ar:'032', au:'036', at:'040', be:'056',
  br:'076', ca:'124', cl:'152', cn:'156', co:'170', hr:'191', cz:'203',
  dk:'208', eg:'818', fi:'246', fr:'250', de:'276', gr:'300', hk:'344',
  hu:'348', is:'352', in:'356', id:'360', ir:'364', iq:'368', ie:'372',
  il:'376', it:'380', jp:'392', jo:'400', my:'458', mx:'484', ma:'504',
  nl:'528', nz:'554', ng:'566', no:'578', pk:'586', ph:'608', pl:'616',
  pt:'620', ro:'642', ru:'643', sa:'682', sg:'702', sk:'703', si:'705',
  za:'710', kr:'410', es:'724', se:'752', ch:'756', tw:'158', th:'764',
  tn:'788', tr:'792', ua:'804', ae:'784', gb:'826', us:'840', uy:'858',
  vn:'704',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function fmtDateLong(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
