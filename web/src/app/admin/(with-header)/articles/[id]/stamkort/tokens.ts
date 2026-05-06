export const COLORS = {
  brandRed:          '#D94A43',
  brandRedDark:      '#B73A33',
  brandRedTint:      '#FCEDEC',
  slate900:          '#1E293B',
  slate700:          '#334155',
  slate600:          '#475569',
  slate500:          '#64748B',
  slate400:          '#94A3B8',
  slate300:          '#CBD5E1',
  slate200:          '#E2E8F0',
  slate100:          '#F1F5F9',
  slate50:           '#F8FAFC',
  bgDefault:         '#EDF5F8',
  bgEditorial:       '#F5F1E8',
  bgEditorialBorder: '#E5DCC8',
};

export const FONTS = {
  serif: "Georgia, 'Times New Roman', serif",
  sans:  "'Helvetica Neue', Helvetica, Arial, sans-serif",
};

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
  const code = COUNTRY_ISO2[country] ?? null;
  if (!code) console.warn(`[Stamkort] Unknown country for flag mapping: "${country}"`);
  return code;
}

// ISO 3166-1 alpha-2 (lowercase) → ISO 3166-1 numeric (string), matching world-atlas feature IDs
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
