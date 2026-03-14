/**
 * Known institutions with pre-mapped city and country.
 * Used as a fallback when affiliation strings lack explicit location segments.
 */

export type InstitutionInfo = {
  institution: string;
  city: string;
  country: string;
};

// Keys are lowercased for case-insensitive lookup.
// The lookup checks if a segment CONTAINS the key (substring match).
// Order: longer keys first to avoid partial matches (e.g. "Aarhus University Hospital" before "Aarhus University").
const RAW_INSTITUTIONS: [string, InstitutionInfo][] = [
  // Danish hospitals (critical for C3)
  ["aarhus university hospital", { institution: "Aarhus University Hospital", city: "Aarhus", country: "Denmark" }],
  ["aalborg university hospital", { institution: "Aalborg University Hospital", city: "Aalborg", country: "Denmark" }],
  ["odense university hospital", { institution: "Odense University Hospital", city: "Odense", country: "Denmark" }],
  ["copenhagen university hospital", { institution: "Copenhagen University Hospital", city: "Copenhagen", country: "Denmark" }],
  ["rigshospitalet", { institution: "Rigshospitalet", city: "Copenhagen", country: "Denmark" }],
  ["hvidovre hospital", { institution: "Hvidovre Hospital", city: "Copenhagen", country: "Denmark" }],
  ["bispebjerg hospital", { institution: "Bispebjerg Hospital", city: "Copenhagen", country: "Denmark" }],
  ["herlev hospital", { institution: "Herlev Hospital", city: "Copenhagen", country: "Denmark" }],
  ["gentofte hospital", { institution: "Gentofte Hospital", city: "Copenhagen", country: "Denmark" }],
  ["nordsjællands hospital", { institution: "Nordsjællands Hospital", city: "Hillerød", country: "Denmark" }],
  ["zealand university hospital", { institution: "Zealand University Hospital", city: "Roskilde", country: "Denmark" }],
  ["danish epilepsy centre", { institution: "Danish Epilepsy Centre", city: "Dianalund", country: "Denmark" }],
  ["danish epilepsy center", { institution: "Danish Epilepsy Centre", city: "Dianalund", country: "Denmark" }],
  ["aalborg hospital", { institution: "Aalborg Hospital", city: "Aalborg", country: "Denmark" }],
  ["aarhus kommunehospital", { institution: "Aarhus Kommunehospital", city: "Aarhus", country: "Denmark" }],
  ["horsens regional hospital", { institution: "Horsens Regional Hospital", city: "Horsens", country: "Denmark" }],

  // Danish universities (longer keys first)
  ["university of southern denmark", { institution: "University of Southern Denmark", city: "Odense", country: "Denmark" }],
  ["university of copenhagen", { institution: "University of Copenhagen", city: "Copenhagen", country: "Denmark" }],
  ["aarhus university", { institution: "Aarhus University", city: "Aarhus", country: "Denmark" }],
  ["aalborg university", { institution: "Aalborg University", city: "Aalborg", country: "Denmark" }],

  // US institutions (frequently mis-parsed as city)
  ["icahn school of medicine at mount sinai", { institution: "Icahn School of Medicine at Mount Sinai", city: "New York", country: "United States" }],
  ["icahn school of medicine", { institution: "Icahn School of Medicine at Mount Sinai", city: "New York", country: "United States" }],
  ["mount sinai hospital", { institution: "Mount Sinai Hospital", city: "New York", country: "United States" }],
  ["memorial sloan kettering cancer center", { institution: "Memorial Sloan Kettering Cancer Center", city: "New York", country: "United States" }],
  ["memorial sloan kettering", { institution: "Memorial Sloan Kettering Cancer Center", city: "New York", country: "United States" }],
  ["nyu grossman school of medicine", { institution: "NYU Grossman School of Medicine", city: "New York", country: "United States" }],
  ["nyu langone health", { institution: "NYU Langone Health", city: "New York", country: "United States" }],
  ["nyu langone", { institution: "NYU Langone Health", city: "New York", country: "United States" }],
  ["weill cornell medical college", { institution: "Weill Cornell Medical College", city: "New York", country: "United States" }],
  ["weill cornell", { institution: "Weill Cornell Medical College", city: "New York", country: "United States" }],
  ["columbia university irving medical center", { institution: "Columbia University Irving Medical Center", city: "New York", country: "United States" }],
  ["columbia university", { institution: "Columbia University", city: "New York", country: "United States" }],
  ["medstar georgetown university hospital", { institution: "MedStar Georgetown University Hospital", city: "Washington", country: "United States" }],
  ["georgetown university school of medicine", { institution: "Georgetown University School of Medicine", city: "Washington", country: "United States" }],
  ["children's national hospital", { institution: "Children's National Hospital", city: "Washington", country: "United States" }],
  ["boston medical center", { institution: "Boston Medical Center", city: "Boston", country: "United States" }],
  ["massachusetts general hospital", { institution: "Massachusetts General Hospital", city: "Boston", country: "United States" }],
  ["hospital for special surgery", { institution: "Hospital for Special Surgery", city: "New York", country: "United States" }],

  // Other US
  ["thomas jefferson university", { institution: "Thomas Jefferson University", city: "Philadelphia", country: "United States" }],
  ["jefferson hospital for neuroscience", { institution: "Jefferson Hospital for Neuroscience", city: "Philadelphia", country: "United States" }],
  ["cleveland clinic abu dhabi", { institution: "Cleveland Clinic Abu Dhabi", city: "Abu Dhabi", country: "United Arab Emirates" }],
  ["cleveland clinic", { institution: "Cleveland Clinic", city: "Cleveland", country: "United States" }],
  ["carilion clinic", { institution: "Carilion Clinic", city: "Roanoke", country: "United States" }],
  ["mayo clinic", { institution: "Mayo Clinic", city: "Rochester", country: "United States" }],
  ["northwell health", { institution: "Northwell Health", city: "New York", country: "United States" }],
  ["sword health", { institution: "Sword Health", city: "New York", country: "United States" }],
  ["uthealth houston", { institution: "UTHealth Houston", city: "Houston", country: "United States" }],
  ["clinical neurosciences center", { institution: "Clinical Neurosciences Center", city: "Salt Lake City", country: "United States" }],
  ["umass chan medical school", { institution: "UMass Chan Medical School", city: "Worcester", country: "United States" }],

  // Japan
  ["ohnishi neurological center", { institution: "Ohnishi Neurological Center", city: "Akashi", country: "Japan" }],

  // Japan (frequently mis-parsed as city)
  ["kyoto university graduate school of medicine", { institution: "Kyoto University", city: "Kyoto", country: "Japan" }],
  ["kyoto university", { institution: "Kyoto University", city: "Kyoto", country: "Japan" }],
  ["kyushu university", { institution: "Kyushu University", city: "Fukuoka", country: "Japan" }],
  ["gifu university graduate school of medicine", { institution: "Gifu University", city: "Gifu", country: "Japan" }],
  ["gifu university", { institution: "Gifu University", city: "Gifu", country: "Japan" }],
  ["the university of tokyo", { institution: "The University of Tokyo", city: "Tokyo", country: "Japan" }],
  ["university of tokyo", { institution: "The University of Tokyo", city: "Tokyo", country: "Japan" }],
  ["chiba university", { institution: "Chiba University", city: "Chiba", country: "Japan" }],

  // Germany
  ["hannover medical school", { institution: "Hannover Medical School", city: "Hannover", country: "Germany" }],
  ["helios horst schmidt hospital wiesbaden", { institution: "Helios Horst Schmidt Hospital Wiesbaden", city: "Wiesbaden", country: "Germany" }],
  ["helios horst schmidt kliniken wiesbaden", { institution: "Helios Horst Schmidt Kliniken Wiesbaden", city: "Wiesbaden", country: "Germany" }],
  ["heinrich-heine university düsseldorf", { institution: "Heinrich-Heine University Düsseldorf", city: "Düsseldorf", country: "Germany" }],
  ["heinrich-heine university dusseldorf", { institution: "Heinrich-Heine University Düsseldorf", city: "Düsseldorf", country: "Germany" }],
  ["heinrich-heine university", { institution: "Heinrich-Heine University Düsseldorf", city: "Düsseldorf", country: "Germany" }],
  ["charité", { institution: "Charité – Universitätsmedizin Berlin", city: "Berlin", country: "Germany" }],
  ["charite", { institution: "Charité – Universitätsmedizin Berlin", city: "Berlin", country: "Germany" }],

  // Finland
  ["helsinki university hospital", { institution: "Helsinki University Hospital", city: "Helsinki", country: "Finland" }],

  // Sweden
  ["karolinska", { institution: "Karolinska Institutet", city: "Stockholm", country: "Sweden" }],

  // Singapore
  ["duke-nus medical school", { institution: "Duke-NUS Medical School", city: "Singapore", country: "Singapore" }],
  ["national neuroscience institute", { institution: "National Neuroscience Institute", city: "Singapore", country: "Singapore" }],

  // Canada
  ["university of toronto", { institution: "University of Toronto", city: "Toronto", country: "Canada" }],

  // China
  ["capital medical university", { institution: "Capital Medical University", city: "Beijing", country: "China" }],

  // Brazil
  ["botucatu medical school", { institution: "Botucatu Medical School", city: "Botucatu", country: "Brazil" }],

  // France
  ["université paris cité", { institution: "Université Paris Cité", city: "Paris", country: "France" }],
  ["universite paris cite", { institution: "Université Paris Cité", city: "Paris", country: "France" }],
];

/**
 * Case-insensitive substring lookup.
 * Returns institution info if the segment contains a known institution name.
 * Checks longer keys first to avoid partial matches.
 */
export function lookupInstitution(segment: string): InstitutionInfo | null {
  const lower = segment.toLowerCase();
  for (const [key, info] of RAW_INSTITUTIONS) {
    if (lower.includes(key)) {
      return info;
    }
  }
  return null;
}

// ── Override cache (loaded from geo_institution_overrides table) ──────────────

let overrideCache: Map<string, InstitutionInfo> | null = null;
let overrideCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadInstitutionOverrides(admin: any): Promise<Map<string, InstitutionInfo>> {
  if (overrideCache && Date.now() - overrideCacheTime < CACHE_TTL) return overrideCache;
  const { data } = await admin
    .from("geo_institution_overrides")
    .select("raw_segment, city, country, institution");
  const map = new Map<string, InstitutionInfo>();
  for (const row of data ?? []) {
    map.set((row.raw_segment as string).toLowerCase(), {
      institution: (row.institution as string) ?? (row.raw_segment as string),
      city: (row.city as string) ?? "",
      country: (row.country as string) ?? "",
    });
  }
  overrideCache = map;
  overrideCacheTime = Date.now();
  return map;
}

export function lookupInstitutionWithOverrides(
  segment: string,
  overrides: Map<string, InstitutionInfo>,
): InstitutionInfo | null {
  const lower = segment.toLowerCase();
  const override = overrides.get(lower);
  if (override) return override;
  return lookupInstitution(segment);
}
