/**
 * City-to-country fallback for affiliations that end with a city
 * instead of a country. Case-insensitive lookup.
 */

interface CityInfo {
  city: string;
  country: string;
}

const CITY_TO_COUNTRY: Record<string, CityInfo> = {
  // === United States ===
  "ann arbor": { city: "Ann Arbor", country: "United States" },
  "atlanta": { city: "Atlanta", country: "United States" },
  "baltimore": { city: "Baltimore", country: "United States" },
  "birmingham": { city: "Birmingham", country: "United States" },
  "boston": { city: "Boston", country: "United States" },
  "bronx": { city: "Bronx", country: "United States" },
  "buffalo": { city: "Buffalo", country: "United States" },
  "carmel": { city: "Carmel", country: "United States" },
  "charlottesville": { city: "Charlottesville", country: "United States" },
  "chicago": { city: "Chicago", country: "United States" },
  "cincinnati": { city: "Cincinnati", country: "United States" },
  "cleveland": { city: "Cleveland", country: "United States" },
  "dallas": { city: "Dallas", country: "United States" },
  "denver": { city: "Denver", country: "United States" },
  "detroit": { city: "Detroit", country: "United States" },
  "el paso": { city: "El Paso", country: "United States" },
  "gainesville": { city: "Gainesville", country: "United States" },
  "houston": { city: "Houston", country: "United States" },
  "indianapolis": { city: "Indianapolis", country: "United States" },
  "la jolla": { city: "La Jolla", country: "United States" },
  "los angeles": { city: "Los Angeles", country: "United States" },
  "louisville": { city: "Louisville", country: "United States" },
  "memphis": { city: "Memphis", country: "United States" },
  "miami": { city: "Miami", country: "United States" },
  "milwaukee": { city: "Milwaukee", country: "United States" },
  "minneapolis": { city: "Minneapolis", country: "United States" },
  "nashville": { city: "Nashville", country: "United States" },
  "new haven": { city: "New Haven", country: "United States" },
  "new york": { city: "New York", country: "United States" },
  "philadelphia": { city: "Philadelphia", country: "United States" },
  "pittsburgh": { city: "Pittsburgh", country: "United States" },
  "portland": { city: "Portland", country: "United States" },
  "providence": { city: "Providence", country: "United States" },
  "rochester": { city: "Rochester", country: "United States" },
  "salt lake city": { city: "Salt Lake City", country: "United States" },
  "san diego": { city: "San Diego", country: "United States" },
  "san francisco": { city: "San Francisco", country: "United States" },
  "seattle": { city: "Seattle", country: "United States" },
  "stanford": { city: "Stanford", country: "United States" },
  "tampa": { city: "Tampa", country: "United States" },

  // === China — cities ===
  "beijing": { city: "Beijing", country: "China" },
  "changchun": { city: "Changchun", country: "China" },
  "changsha": { city: "Changsha", country: "China" },
  "chengdu": { city: "Chengdu", country: "China" },
  "chongqing": { city: "Chongqing", country: "China" },
  "fuzhou": { city: "Fuzhou", country: "China" },
  "guangzhou": { city: "Guangzhou", country: "China" },
  "hangzhou": { city: "Hangzhou", country: "China" },
  "harbin": { city: "Harbin", country: "China" },
  "hefei": { city: "Hefei", country: "China" },
  "jinan": { city: "Jinan", country: "China" },
  "kunming": { city: "Kunming", country: "China" },
  "nanchang": { city: "Nanchang", country: "China" },
  "nanjing": { city: "Nanjing", country: "China" },
  "shanghai": { city: "Shanghai", country: "China" },
  "shenzhen": { city: "Shenzhen", country: "China" },
  "tianjin": { city: "Tianjin", country: "China" },
  "wuhan": { city: "Wuhan", country: "China" },
  "xi'an": { city: "Xi'an", country: "China" },
  "zhengzhou": { city: "Zhengzhou", country: "China" },

  // === China — provinces ===
  "anhui": { city: "Hefei", country: "China" },
  "fujian": { city: "Fuzhou", country: "China" },
  "gansu": { city: "Lanzhou", country: "China" },
  "guangdong": { city: "Guangzhou", country: "China" },
  "guizhou": { city: "Guiyang", country: "China" },
  "hebei": { city: "Shijiazhuang", country: "China" },
  "heilongjiang": { city: "Harbin", country: "China" },
  "henan": { city: "Zhengzhou", country: "China" },
  "hubei": { city: "Wuhan", country: "China" },
  "hunan": { city: "Changsha", country: "China" },
  "jiangsu": { city: "Nanjing", country: "China" },
  "jiangsu province": { city: "Nanjing", country: "China" },
  "jilin": { city: "Changchun", country: "China" },
  "liaoning": { city: "Shenyang", country: "China" },
  "shaanxi": { city: "Xi'an", country: "China" },
  "shandong": { city: "Jinan", country: "China" },
  "shanxi": { city: "Taiyuan", country: "China" },
  "sichuan": { city: "Chengdu", country: "China" },
  "yunnan": { city: "Kunming", country: "China" },
  "zhejiang": { city: "Hangzhou", country: "China" },
  "zhejiang province": { city: "Hangzhou", country: "China" },

  // === Japan — cities ===
  "fukuoka": { city: "Fukuoka", country: "Japan" },
  "hiroshima": { city: "Hiroshima", country: "Japan" },
  "kobe": { city: "Kobe", country: "Japan" },
  "kyoto": { city: "Kyoto", country: "Japan" },
  "nagoya": { city: "Nagoya", country: "Japan" },
  "niigata": { city: "Niigata", country: "Japan" },
  "osaka": { city: "Osaka", country: "Japan" },
  "sapporo": { city: "Sapporo", country: "Japan" },
  "sendai": { city: "Sendai", country: "Japan" },
  "tokyo": { city: "Tokyo", country: "Japan" },

  // === Japan — prefectures ===
  "aichi": { city: "Nagoya", country: "Japan" },
  "chiba": { city: "Chiba", country: "Japan" },
  "fukushima": { city: "Fukushima", country: "Japan" },
  "gunma": { city: "Maebashi", country: "Japan" },
  "hokkaido": { city: "Sapporo", country: "Japan" },
  "hyogo": { city: "Kobe", country: "Japan" },
  "ibaraki": { city: "Mito", country: "Japan" },
  "kanagawa": { city: "Yokohama", country: "Japan" },
  "miyagi": { city: "Sendai", country: "Japan" },
  "nagano": { city: "Nagano", country: "Japan" },
  "saitama": { city: "Saitama", country: "Japan" },
  "shizuoka": { city: "Shizuoka", country: "Japan" },
  "tochigi": { city: "Utsunomiya", country: "Japan" },

  // === South Korea ===
  "busan": { city: "Busan", country: "South Korea" },
  "daegu": { city: "Daegu", country: "South Korea" },
  "gyeonggi": { city: "Suwon", country: "South Korea" },
  "gyeonggi-do": { city: "Suwon", country: "South Korea" },
  "incheon": { city: "Incheon", country: "South Korea" },
  "seongnam": { city: "Seongnam", country: "South Korea" },
  "seoul": { city: "Seoul", country: "South Korea" },

  // === Taiwan ===
  "taipei": { city: "Taipei", country: "Taiwan" },

  // === Canada — cities ===
  "montreal": { city: "Montreal", country: "Canada" },
  "ottawa": { city: "Ottawa", country: "Canada" },
  "toronto": { city: "Toronto", country: "Canada" },
  "vancouver": { city: "Vancouver", country: "Canada" },

  // === Canada — provinces ===
  "alberta": { city: "Edmonton", country: "Canada" },
  "british columbia": { city: "Vancouver", country: "Canada" },
  "ontario": { city: "Toronto", country: "Canada" },
  "quebec": { city: "Montreal", country: "Canada" },

  // === Europe ===
  "london": { city: "London", country: "United Kingdom" },
  "paris": { city: "Paris", country: "France" },
  "umeå": { city: "Umeå", country: "Sweden" },
  "utrecht": { city: "Utrecht", country: "Netherlands" },
};

/** Case-insensitive city lookup. Returns city + country or null. */
export function lookupCity(raw: string): CityInfo | null {
  const cleaned = raw.replace(/\.+$/, "").trim().toLowerCase();
  return CITY_TO_COUNTRY[cleaned] ?? null;
}
