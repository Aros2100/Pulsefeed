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

  // South Korean provinces
  "gyeonggi", "gyeongsang", "chungcheong", "jeolla", "gangwon", "jeju",
]);

export function isAdministrativeRegion(segment: string): boolean {
  return REGIONS.has(segment.trim().toLowerCase());
}
