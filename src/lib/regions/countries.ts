import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';

// Register English language
countries.registerLocale(en);

export interface Country {
  code: string;
  name: string;
}

export function getAllCountries(): Country[] {
  const countryObj = countries.getNames('en', { select: 'official' });
  
  return Object.entries(countryObj)
    .map(([code, name]) => ({
      code,
      name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCountryName(code: string): string | undefined {
  return countries.getName(code, 'en');
}
