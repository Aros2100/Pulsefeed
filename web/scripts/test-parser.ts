import { parseAffiliation } from './src/lib/geo/affiliation-parser';
import { lookupCountry } from './src/lib/geo/country-map';
import { isAdministrativeRegion } from './src/lib/geo/region-map';
import { getCityCache } from './src/lib/geo/city-cache';

console.log('lookupCountry Tehran:', lookupCountry('Tehran'));
console.log('isAdministrativeRegion Tehran:', isAdministrativeRegion('Tehran'));

(async () => {
  const { names } = await getCityCache();
  console.log('cityNames size:', names.size);
  console.log('has tehran:', names.has('tehran'));
  console.log('has tiran:', names.has('tīrān'));
  console.log('has tiran unaccented:', names.has('tiran'));

  const result = await parseAffiliation(
    'Department of Neurosurgery, Shariati Hospital, Tehran University of Medical Sciences, Tehran, Iran.'
  );
  console.log(JSON.stringify(result, null, 2));
})();
