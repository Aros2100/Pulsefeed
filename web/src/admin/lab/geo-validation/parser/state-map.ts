/**
 * State / province lookup for non-US countries.
 * Exported as lookupState(token, country?) → { state, country } | null.
 *
 * Strip "Province", "Prefecture", "State of" before calling.
 * Beijing/Shanghai/Tianjin/Chongqing are intentionally absent from the China
 * list — they are also major cities and are handled as GEO_CITY by the parser.
 */

// ── India ─────────────────────────────────────────────────────────────────────
const INDIA: Record<string, string> = {
  // 28 states
  "andhra pradesh":    "Andhra Pradesh",
  "arunachal pradesh": "Arunachal Pradesh",
  "assam":             "Assam",
  "bihar":             "Bihar",
  "chhattisgarh":      "Chhattisgarh",
  "goa":               "Goa",
  "gujarat":           "Gujarat",
  "haryana":           "Haryana",
  "himachal pradesh":  "Himachal Pradesh",
  "jharkhand":         "Jharkhand",
  "karnataka":         "Karnataka",
  "kerala":            "Kerala",
  "madhya pradesh":    "Madhya Pradesh",
  "maharashtra":       "Maharashtra",
  "manipur":           "Manipur",
  "meghalaya":         "Meghalaya",
  "mizoram":           "Mizoram",
  "nagaland":          "Nagaland",
  "odisha":            "Odisha",
  "orissa":            "Odisha",
  "punjab":            "Punjab",
  "rajasthan":         "Rajasthan",
  "sikkim":            "Sikkim",
  "tamil nadu":        "Tamil Nadu",
  "telangana":         "Telangana",
  "tripura":           "Tripura",
  "uttar pradesh":     "Uttar Pradesh",
  "uttarakhand":       "Uttarakhand",
  "uttaranchal":       "Uttarakhand",
  "west bengal":       "West Bengal",
  // Union territories
  "andaman and nicobar islands": "Andaman and Nicobar Islands",
  "chandigarh":                  "Chandigarh",
  "delhi":                       "Delhi",
  "new delhi":                   "Delhi",
  "jammu and kashmir":           "Jammu and Kashmir",
  "ladakh":                      "Ladakh",
  "lakshadweep":                 "Lakshadweep",
  "puducherry":                  "Puducherry",
  "pondicherry":                 "Puducherry",
  "dadra and nagar haveli":      "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu":               "Dadra and Nagar Haveli and Daman and Diu",
};

// ── Canada ────────────────────────────────────────────────────────────────────
const CANADA: Record<string, string> = {
  // 10 provinces
  "alberta":                "Alberta",
  "ab":                     "Alberta",
  "british columbia":       "British Columbia",
  "bc":                     "British Columbia",
  "b.c.":                   "British Columbia",
  "manitoba":               "Manitoba",
  "mb":                     "Manitoba",
  "new brunswick":          "New Brunswick",
  "nb":                     "New Brunswick",
  "newfoundland":           "Newfoundland and Labrador",
  "newfoundland and labrador": "Newfoundland and Labrador",
  "nl":                     "Newfoundland and Labrador",
  "nfld":                   "Newfoundland and Labrador",
  "nova scotia":            "Nova Scotia",
  "ns":                     "Nova Scotia",
  "ontario":                "Ontario",
  "on":                     "Ontario",
  "ont":                    "Ontario",
  "prince edward island":   "Prince Edward Island",
  "pei":                    "Prince Edward Island",
  "quebec":                 "Quebec",
  "québec":                 "Quebec",
  "qc":                     "Quebec",
  "que":                    "Quebec",
  "qué":                    "Quebec",
  "saskatchewan":           "Saskatchewan",
  "sk":                     "Saskatchewan",
  "sask":                   "Saskatchewan",
  // 3 territories
  "northwest territories":  "Northwest Territories",
  "nwt":                    "Northwest Territories",
  "nt":                     "Northwest Territories",
  "nunavut":                "Nunavut",
  "nu":                     "Nunavut",
  "yukon":                  "Yukon",
  "yt":                     "Yukon",
};

// ── China ─────────────────────────────────────────────────────────────────────
// 22 provinces + 5 autonomous regions (municipality-level cities excluded —
// Beijing, Shanghai, Tianjin, Chongqing are classified as GEO_CITY)
const CHINA: Record<string, string> = {
  // Provinces
  "anhui":     "Anhui",
  "fujian":    "Fujian",
  "gansu":     "Gansu",
  "guangdong": "Guangdong",
  "guizhou":   "Guizhou",
  "hainan":    "Hainan",
  "hebei":     "Hebei",
  "heilongjiang": "Heilongjiang",
  "henan":     "Henan",
  "hubei":     "Hubei",
  "hunan":     "Hunan",
  "jiangsu":   "Jiangsu",
  "jiangxi":   "Jiangxi",
  "jilin":     "Jilin",
  "liaoning":  "Liaoning",
  "qinghai":   "Qinghai",
  "shaanxi":   "Shaanxi",
  "shandong":  "Shandong",
  "shanxi":    "Shanxi",
  "sichuan":   "Sichuan",
  "yunnan":    "Yunnan",
  "zhejiang":  "Zhejiang",
  // Autonomous regions
  "guangxi":              "Guangxi",
  "guangxi zhuang":       "Guangxi",
  "inner mongolia":       "Inner Mongolia",
  "nei mongol":           "Inner Mongolia",
  "ningxia":              "Ningxia",
  "ningxia hui":          "Ningxia",
  "tibet":                "Tibet",
  "xizang":               "Tibet",
  "xinjiang":             "Xinjiang",
  "xinjiang uyghur":      "Xinjiang",
  "xinjiang uygur":       "Xinjiang",
};

// ── Japan ─────────────────────────────────────────────────────────────────────
// 47 prefectures (capitalized canonical forms)
const JAPAN: Record<string, string> = {
  "aichi":      "Aichi",
  "akita":      "Akita",
  "aomori":     "Aomori",
  "chiba":      "Chiba",
  "ehime":      "Ehime",
  "fukui":      "Fukui",
  "fukuoka":    "Fukuoka",
  "fukushima":  "Fukushima",
  "gifu":       "Gifu",
  "gunma":      "Gunma",
  "hiroshima":  "Hiroshima",
  "hokkaido":   "Hokkaido",
  "hyogo":      "Hyogo",
  "ibaraki":    "Ibaraki",
  "ishikawa":   "Ishikawa",
  "iwate":      "Iwate",
  "kagawa":     "Kagawa",
  "kagoshima":  "Kagoshima",
  "kanagawa":   "Kanagawa",
  "kochi":      "Kochi",
  "kumamoto":   "Kumamoto",
  "kyoto":      "Kyoto",
  "mie":        "Mie",
  "miyagi":     "Miyagi",
  "miyazaki":   "Miyazaki",
  "nagano":     "Nagano",
  "nagasaki":   "Nagasaki",
  "nara":       "Nara",
  "niigata":    "Niigata",
  "oita":       "Oita",
  "okayama":    "Okayama",
  "okinawa":    "Okinawa",
  "osaka":      "Osaka",
  "saga":       "Saga",
  "saitama":    "Saitama",
  "shiga":      "Shiga",
  "shimane":    "Shimane",
  "shizuoka":   "Shizuoka",
  "tochigi":    "Tochigi",
  "tokushima":  "Tokushima",
  "tokyo":      "Tokyo",
  "tottori":    "Tottori",
  "toyama":     "Toyama",
  "wakayama":   "Wakayama",
  "yamagata":   "Yamagata",
  "yamaguchi":  "Yamaguchi",
  "yamanashi":  "Yamanashi",
};

// ── Brazil ────────────────────────────────────────────────────────────────────
// 26 states + Distrito Federal, with 2-letter abbreviations
const BRAZIL: Record<string, string> = {
  "acre":              "Acre",             "ac": "Acre",
  "alagoas":           "Alagoas",          "al": "Alagoas",
  "amapá":             "Amapá",            "ap": "Amapá",
  "amapa":             "Amapá",
  "amazonas":          "Amazonas",         "am": "Amazonas",
  "bahia":             "Bahia",            "ba": "Bahia",
  "ceará":             "Ceará",            "ce": "Ceará",
  "ceara":             "Ceará",
  "distrito federal":  "Distrito Federal", "df": "Distrito Federal",
  "espírito santo":    "Espírito Santo",   "es": "Espírito Santo",
  "espirito santo":    "Espírito Santo",
  "goiás":             "Goiás",            "go": "Goiás",
  "goias":             "Goiás",
  "maranhão":          "Maranhão",         "ma": "Maranhão",
  "maranhao":          "Maranhão",
  "mato grosso":       "Mato Grosso",      "mt": "Mato Grosso",
  "mato grosso do sul":"Mato Grosso do Sul","ms": "Mato Grosso do Sul",
  "minas gerais":      "Minas Gerais",     "mg": "Minas Gerais",
  "pará":              "Pará",             "pa": "Pará",
  "para":              "Pará",
  "paraíba":           "Paraíba",          "pb": "Paraíba",
  "paraiba":           "Paraíba",
  "paraná":            "Paraná",           "pr": "Paraná",
  "parana":            "Paraná",
  "pernambuco":        "Pernambuco",       "pe": "Pernambuco",
  "piauí":             "Piauí",            "pi": "Piauí",
  "piaui":             "Piauí",
  "rio de janeiro":    "Rio de Janeiro",   "rj": "Rio de Janeiro",
  "rio grande do norte":"Rio Grande do Norte","rn":"Rio Grande do Norte",
  "rio grande do sul": "Rio Grande do Sul","rs": "Rio Grande do Sul",
  "rondônia":          "Rondônia",         "ro": "Rondônia",
  "rondonia":          "Rondônia",
  "roraima":           "Roraima",          "rr": "Roraima",
  "santa catarina":    "Santa Catarina",   "sc": "Santa Catarina",
  "são paulo":         "São Paulo",        "sp": "São Paulo",
  "sao paulo":         "São Paulo",
  "sergipe":           "Sergipe",          "se": "Sergipe",
  "tocantins":         "Tocantins",        "to": "Tocantins",
};

// ── Australia ─────────────────────────────────────────────────────────────────
const AUSTRALIA: Record<string, string> = {
  "new south wales":          "New South Wales",       "nsw": "New South Wales",
  "victoria":                 "Victoria",               "vic": "Victoria",
  "queensland":               "Queensland",             "qld": "Queensland",
  "south australia":          "South Australia",        "sa":  "South Australia",
  "western australia":        "Western Australia",      "wa":  "Western Australia",
  "tasmania":                 "Tasmania",               "tas": "Tasmania",
  "australian capital territory": "Australian Capital Territory", "act": "Australian Capital Territory",
  "northern territory":       "Northern Territory",     "nt":  "Northern Territory",
};

// ── Nigeria ───────────────────────────────────────────────────────────────────
// 36 states + Federal Capital Territory
const NIGERIA: Record<string, string> = {
  "abia":              "Abia",
  "adamawa":           "Adamawa",
  "akwa ibom":         "Akwa Ibom",
  "anambra":           "Anambra",
  "bauchi":            "Bauchi",
  "bayelsa":           "Bayelsa",
  "benue":             "Benue",
  "borno":             "Borno",
  "cross river":       "Cross River",
  "delta":             "Delta",
  "ebonyi":            "Ebonyi",
  "edo":               "Edo",
  "ekiti":             "Ekiti",
  "enugu":             "Enugu",
  "gombe":             "Gombe",
  "imo":               "Imo",
  "jigawa":            "Jigawa",
  "kaduna":            "Kaduna",
  "kano":              "Kano",
  "katsina":           "Katsina",
  "kebbi":             "Kebbi",
  "kogi":              "Kogi",
  "kwara":             "Kwara",
  "lagos":             "Lagos",
  "nasarawa":          "Nasarawa",
  "niger":             "Niger",
  "ogun":              "Ogun",
  "ondo":              "Ondo",
  "osun":              "Osun",
  "oyo":               "Oyo",
  "plateau":           "Plateau",
  "rivers":            "Rivers",
  "sokoto":            "Sokoto",
  "taraba":            "Taraba",
  "yobe":              "Yobe",
  "zamfara":           "Zamfara",
  // Federal Capital Territory
  "fct":                        "FCT",
  "abuja":                      "FCT",
  "federal capital territory":  "FCT",
};

// ── Egypt ─────────────────────────────────────────────────────────────────────
// 27 governorates — publication-relevant subset
const EGYPT: Record<string, string> = {
  "cairo":          "Cairo",
  "giza":           "Giza",
  "alexandria":     "Alexandria",
  "dakahlia":       "Dakahlia",
  "sharqia":        "Sharqia",
  "sharqiya":       "Sharqia",
  "ash sharqiyah":  "Sharqia",
  "qalyubia":       "Qalyubia",
  "gharbia":        "Gharbia",
  "menoufia":       "Menoufia",
  "menofia":        "Menoufia",
  "beheira":        "Beheira",
  "kafr el-sheikh": "Kafr el-Sheikh",
  "kafr el sheikh": "Kafr el-Sheikh",
  "minya":          "Minya",
  "asyut":          "Asyut",
  "assiut":         "Asyut",
  "sohag":          "Sohag",
  "qena":           "Qena",
  "luxor":          "Luxor",
  "aswan":          "Aswan",
  "red sea":        "Red Sea",
  "suez":           "Suez",
  "port said":      "Port Said",
  "ismailia":       "Ismailia",
  "damietta":       "Damietta",
  "beni suef":      "Beni Suef",
  "beni-suef":      "Beni Suef",
  "faiyum":         "Faiyum",
  "fayoum":         "Faiyum",
  "matruh":         "Matruh",
  "new valley":     "New Valley",
  "north sinai":    "North Sinai",
  "south sinai":    "South Sinai",
};

// ── South Africa ─────────────────────────────────────────────────────────────
// 9 provinces
const SOUTH_AFRICA: Record<string, string> = {
  "eastern cape":   "Eastern Cape",
  "free state":     "Free State",
  "gauteng":        "Gauteng",
  "kwazulu-natal":  "KwaZulu-Natal",
  "kwazulu natal":  "KwaZulu-Natal",
  "kzn":            "KwaZulu-Natal",
  "limpopo":        "Limpopo",
  "mpumalanga":     "Mpumalanga",
  "north west":     "North West",
  "northern cape":  "Northern Cape",
  "western cape":   "Western Cape",
};

// ── Kenya ─────────────────────────────────────────────────────────────────────
// 47 counties — publication-relevant subset
const KENYA: Record<string, string> = {
  "nairobi":          "Nairobi",
  "mombasa":          "Mombasa",
  "kisumu":           "Kisumu",
  "nakuru":           "Nakuru",
  "uasin gishu":      "Uasin Gishu",   // Eldoret area
  "meru":             "Meru",
  "kilifi":           "Kilifi",
  "nyeri":            "Nyeri",
  "machakos":         "Machakos",
  "kakamega":         "Kakamega",
  "kiambu":           "Kiambu",
  "nyandarua":        "Nyandarua",
  "kirinyaga":        "Kirinyaga",
  "muranga":          "Murang'a",
  "murang'a":         "Murang'a",
  "siaya":            "Siaya",
  "homa bay":         "Homa Bay",
  "migori":           "Migori",
  "kisii":            "Kisii",
  "nyamira":          "Nyamira",
  "kericho":          "Kericho",
  "bomet":            "Bomet",
  "nandi":            "Nandi",
  "baringo":          "Baringo",
  "laikipia":         "Laikipia",
  "samburu":          "Samburu",
  "trans nzoia":      "Trans Nzoia",
  "west pokot":       "West Pokot",
  "elgeyo marakwet":  "Elgeyo Marakwet",
  "turkana":          "Turkana",
  "marsabit":         "Marsabit",
  "isiolo":           "Isiolo",
  "garissa":          "Garissa",
  "wajir":            "Wajir",
  "mandera":          "Mandera",
  "tana river":       "Tana River",
  "lamu":             "Lamu",
  "taita taveta":     "Taita Taveta",
  "kwale":            "Kwale",
  "kajiado":          "Kajiado",
  "makueni":          "Makueni",
  "kitui":            "Kitui",
  "embu":             "Embu",
  "tharaka nithi":    "Tharaka Nithi",
  "vihiga":           "Vihiga",
  "busia":            "Busia",
  "bungoma":          "Bungoma",
};

// ── Ghana ─────────────────────────────────────────────────────────────────────
// 16 regions — compound names only to avoid ambiguity with bare directionals
const GHANA: Record<string, string> = {
  "greater accra":  "Greater Accra",
  "ashanti":        "Ashanti",
  "brong-ahafo":    "Brong-Ahafo",
  "brong ahafo":    "Brong-Ahafo",
  "bono":           "Bono",
  "bono east":      "Bono East",
  "ahafo":          "Ahafo",
  "western north":  "Western North",
  "oti":            "Oti",
  "north east":     "North East",
  "savannah":       "Savannah",
  "upper east":     "Upper East",
  "upper west":     "Upper West",
  "volta":          "Volta",
};

// ── Merged lookup table ───────────────────────────────────────────────────────

type StateEntry = { state: string; country: string };

const STATE_MAP: Map<string, StateEntry> = new Map();

function addCountry(table: Record<string, string>, country: string) {
  for (const [k, v] of Object.entries(table)) {
    STATE_MAP.set(k.toLowerCase(), { state: v, country });
  }
}

addCountry(INDIA,        "India");
addCountry(CANADA,       "Canada");
addCountry(CHINA,        "China");
addCountry(JAPAN,        "Japan");
addCountry(BRAZIL,       "Brazil");
addCountry(AUSTRALIA,    "Australia");
addCountry(NIGERIA,      "Nigeria");
addCountry(EGYPT,        "Egypt");
addCountry(SOUTH_AFRICA, "South Africa");
addCountry(KENYA,        "Kenya");
addCountry(GHANA,        "Ghana");

const STRIP_RE = /\b(Province|Provincial|Prefecture|State\s+of|Autonomous\s+Region|Governorate)\b/gi;

/**
 * Look up a state/province name token.
 * Strips common suffixes ("Province", "Prefecture", "State of") before lookup.
 * If `country` is provided, only matches for that country are returned.
 */
export function lookupState(
  token: string,
  country?: string
): StateEntry | null {
  const stripped = token.replace(STRIP_RE, "").trim().toLowerCase();
  // Fix 1 (R10): also strip trailing bare "State" suffix ("Ogun State" → "Ogun").
  // Tried after STRIP_RE so that "Free State" hits the direct match first.
  const noStateSuffix = token.trim().replace(/\s+State\s*$/i, "").trim().toLowerCase();
  const original = token.trim().toLowerCase();

  // Deduplicated candidate list: stripped first (STRIP_RE handles "Province", etc.),
  // then trailing-State variant, then verbatim.
  const seen = new Set<string>();
  for (const key of [stripped, noStateSuffix, original]) {
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = STATE_MAP.get(key);
    if (!entry) continue;
    if (country && entry.country !== country) continue;
    return entry;
  }
  return null;
}

/** All canonical state names across all countries (lowercased) */
export const ALL_STATE_NAMES: Set<string> = new Set(STATE_MAP.keys());
