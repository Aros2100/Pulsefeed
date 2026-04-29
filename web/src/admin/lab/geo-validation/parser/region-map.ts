/**
 * Administrative regions (states, provinces, prefectures) that should NOT be treated as cities.
 * Case-insensitive lookup.
 */

const REGIONS = new Set([
  // US states (full names)
  "massachusetts", "texas", "minnesota", "california", "new york",
  "pennsylvania", "florida", "ohio", "virginia", "maryland",
  "connecticut", "illinois", "michigan", "wisconsin", "colorado",
  "oregon", "washington", "arizona", "georgia", "north carolina",
  "south carolina", "tennessee", "indiana", "missouri", "louisiana",
  "alabama", "kentucky", "oklahoma", "iowa", "kansas",
  "nebraska", "arkansas", "mississippi", "nevada", "utah",
  "new mexico", "hawaii", "alaska", "maine", "vermont",
  "new hampshire", "rhode island", "delaware", "montana", "idaho",
  "wyoming", "north dakota", "south dakota", "west virginia",
  "district of columbia", "new jersey",

  // Chinese provinces
  "heilongjiang", "xinjiang", "anhui", "sichuan", "henan",
  "hubei", "hunan", "guangdong", "guangxi", "yunnan",
  "guizhou", "jiangxi", "jiangsu", "zhejiang", "fujian",
  "shandong", "shanxi", "shaanxi", "hebei", "liaoning",
  "jilin", "gansu", "qinghai", "hainan", "inner mongolia",
  "tibet", "ningxia",

  // Japanese prefectures
  "gunma", "hyogo", "hokkaido", "aichi", "osaka", "kyoto",
  "fukuoka", "hiroshima", "miyagi", "niigata", "nagano",
  "shizuoka", "ibaraki", "tochigi", "saitama", "chiba",
  "kanagawa", "nara", "wakayama", "mie", "gifu",
  "toyama", "ishikawa", "fukui", "yamanashi", "nagasaki",
  "kumamoto", "oita", "kagoshima", "okinawa", "ehime",
  "tokushima", "kagawa", "kochi", "shimane", "tottori",
  "yamaguchi", "saga", "iwate", "akita", "yamagata",
  "fukushima", "aomori",

  // Indian states
  "rajasthan", "haryana", "maharashtra", "karnataka", "tamil nadu",
  "kerala", "gujarat", "madhya pradesh", "uttar pradesh", "bihar",
  "west bengal", "odisha", "telangana", "andhra pradesh", "punjab",
  "jharkhand", "assam", "chhattisgarh", "uttarakhand",
  "himachal pradesh", "goa", "manipur", "meghalaya", "mizoram",
  "nagaland", "sikkim", "tripura", "arunachal pradesh",

  // Australian states
  "victoria", "queensland", "new south wales", "western australia",
  "south australia", "tasmania", "northern territory",
  "australian capital territory",

  // Brazilian states
  "minas gerais", "rio grande do sul", "paraná", "parana",
  "santa catarina", "bahia", "pernambuco", "ceará", "ceara",

  // Mexican states
  "mexico",  // Estado de México — also protects "Mexico City" from being stripped to "Mexico"

  // Canadian provinces
  "alberta", "ontario", "quebec", "british columbia", "manitoba",
  "saskatchewan", "nova scotia", "new brunswick",
  "newfoundland and labrador", "prince edward island",
  "northwest territories", "nunavut", "yukon",

  // Pakistani provinces
  "sindh", "balochistan", "khyber pakhtunkhwa",

  // South Korean provinces
  "gyeonggi", "gyeonggi-do", "gyeongsang", "gangwon", "gangwon-do",
  "chungcheong", "chungcheongnam-do", "chungcheongbuk-do",
  "jeolla", "jeollanam-do", "jeollabuk-do",
  "gyeongsangnam-do", "gyeongsangbuk-do", "jeju", "jeju-do",

  // Indonesian provinces
  "east java", "west java", "central java", "north sumatra", "south sulawesi",

  // French regions
  "centre-val de loire", "île-de-france", "nouvelle-aquitaine", "occitanie",
  "provence-alpes-côte d'azur", "auvergne-rhône-alpes", "grand est",
  "hauts-de-france", "normandie", "bretagne", "pays de la loire",
  "bourgogne-franche-comté", "centre",

  // Ecuadorian provinces
  "guayas",
]);

/** Province/state abbreviations: Canada, Brazil, Australia, India */
const PROVINCE_CODES = new Set([
  // Canadian (2-letter + longer abbreviations)
  "ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "NT", "NU", "YT",
  "ONT", "QUE", "SASK", "MAN", "ALTA",
  // Brazilian
  "SP", "RJ", "MG", "RS", "PR", "SC", "BA", "CE", "PE", "GO", "PA", "MA", "MT", "MS", "AM", "ES", "PB", "RN", "AL", "SE", "PI", "DF",
  // Australian
  "NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT",
  // German Bundesländer
  "NRW", "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", "NI", "RP", "SL", "SN", "ST", "SH", "TH",
  // Others
  "KPK", "BKK", "OKC", "DZA", "SLV", "CRI", "CUZ", "SAR", "PV", "TO", "UD",
  // Indian
  "MH", "KA", "TN", "DL", "UP", "GJ", "RJ", "WB", "AP", "TS", "KL", "MP", "HR", "PB", "BR", "OR", "JH", "CG", "UK", "GA", "HP", "JK", "MN", "ML", "MZ", "NL", "SK", "TR", "AR", "AS",
]);

export function isProvinceCode(segment: string): boolean {
  return PROVINCE_CODES.has(segment.trim().toUpperCase());
}

/** Specific administrative regions not covered by suffix stripping */
const HARDCODED_REGIONS = new Set([
  // Danish regions
  "region hovedstaden", "region sjælland", "region syddanmark",
  "region midtjylland", "region nordjylland",
  // Chinese autonomous regions / special cases
  "inner mongolia autonomous region", "tibet autonomous region",
  "guangxi zhuang autonomous region", "ningxia hui autonomous region",
  "xinjiang uyghur autonomous region",
  // Chinese districts
  "xicheng district", "haidian district", "chaoyang district",
  "pudong new area",
]);

/** Suffixes that indicate an administrative region */
const ADMIN_SUFFIXES = [
  "autonomous region", "district", "province", "county",
  "prefecture", "region", "governorate", "oblast", "state",
];

export function isAdministrativeRegion(segment: string): boolean {
  const cleaned = segment.trim().toLowerCase();
  if (REGIONS.has(cleaned)) return true;
  if (HARDCODED_REGIONS.has(cleaned)) return true;
  // Strip trailing administrative suffixes and check against REGIONS set
  for (const suffix of ADMIN_SUFFIXES) {
    if (cleaned.endsWith(" " + suffix)) {
      const stripped = cleaned.slice(0, -(suffix.length + 1)).trim();
      if (stripped && REGIONS.has(stripped)) return true;
    }
  }
  // Match any segment ending with an administrative suffix (even if base not in REGIONS)
  for (const suffix of ADMIN_SUFFIXES) {
    if (cleaned.endsWith(" " + suffix)) return true;
  }
  return false;
}
