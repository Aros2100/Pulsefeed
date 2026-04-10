import { parseAffiliation } from "../src/lib/geo/affiliation-parser";

const cases: { input: string; expectedCity: string | null; expectedCountry: string }[] = [
  {
    input: "Department of Neurosurgery, Weill Cornell Medical Center, New York, New York, USA.",
    expectedCity: "New York",
    expectedCountry: "United States",
  },
  {
    input: "Department of Pathology, NYU Grossman School of Medicine, NYU Langone Health, New York, New York 10016, USA.",
    expectedCity: "New York",
    expectedCountry: "United States",
  },
  {
    input: "Department of Neurology, Westchester Medical Center, Valhalla, NY, USA.",
    expectedCity: "Valhalla",
    expectedCountry: "United States",
  },
  {
    input: "Department of Neurosurgery, NYU Grossman School of Medicine, New York, NY, USA.",
    expectedCity: "New York",
    expectedCountry: "United States",
  },
  {
    input: "Department of Neurosurgery, Beijing Tiantan Hospital, Beijing100730, China.",
    expectedCity: "Beijing",
    expectedCountry: "China",
  },
  {
    input: "Department of Anatomical and Cellular Pathology, The Chinese University of Hong Kong, Hong Kong, Hong Kong SAR, China.",
    expectedCity: "Hong Kong",
    expectedCountry: "China",
  },
  {
    // Manhasset ~8k pop — not in geo_cities; country from N.Y. is what matters
    input: "Department of Neurosurgery, Zucker School of Medicine at Hofstra, Long Island Jewish Medical Center, Manhasset, N.Y.",
    expectedCity: null,
    expectedCountry: "United States",
  },
  {
    // Markdale ~1.5k pop — not in geo_cities; country from Ont. is what matters
    input: "Canadian Spine Society, Markdale, Ont.",
    expectedCity: null,
    expectedCountry: "Canada",
  },
  {
    // Dakar is capital of Senegal — correctly found as city
    input: "Hôpital de Dakar, Sénégal.",
    expectedCity: "Dakar",
    expectedCountry: "Senegal",
  },
];

(async () => {
  for (const { input, expectedCity, expectedCountry } of cases) {
    const result = await parseAffiliation(input);
    const city    = result?.city    ?? "null";
    const country = result?.country ?? "null";
    const cityOk    = city    === (expectedCity ?? "null");
    const countryOk = country === expectedCountry;
    const status = cityOk && countryOk ? "✓" : "✗";
    console.log(`${status} city=${city}, country=${country}`);
    if (!cityOk)    console.log(`    city expected:    ${expectedCity}`);
    if (!countryOk) console.log(`    country expected: ${expectedCountry}`);
  }
})();
