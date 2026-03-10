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

  // Danish universities (longer keys first)
  ["university of southern denmark", { institution: "University of Southern Denmark", city: "Odense", country: "Denmark" }],
  ["university of copenhagen", { institution: "University of Copenhagen", city: "Copenhagen", country: "Denmark" }],
  ["aarhus university", { institution: "Aarhus University", city: "Aarhus", country: "Denmark" }],
  ["aalborg university", { institution: "Aalborg University", city: "Aalborg", country: "Denmark" }],

  // Other frequently seen
  ["mayo clinic", { institution: "Mayo Clinic", city: "Rochester", country: "United States" }],
  ["karolinska", { institution: "Karolinska Institutet", city: "Stockholm", country: "Sweden" }],
  ["charité", { institution: "Charité – Universitätsmedizin Berlin", city: "Berlin", country: "Germany" }],
  ["charite", { institution: "Charité – Universitätsmedizin Berlin", city: "Berlin", country: "Germany" }],
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
