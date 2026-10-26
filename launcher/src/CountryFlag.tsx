import codes from '../../web/shared/flags/countries.json';

const known = new Set(codes);
export function countryName(code: string | undefined, language: string): string | undefined {
  const normalized = code?.trim().toUpperCase() || '';
  if (!known.has(normalized)) return undefined;
  try { return new Intl.DisplayNames([language], { type: 'region' }).of(normalized); }
  catch { return undefined; }
}

export default function CountryFlag({ code, language, showName = false }: { code?: string; language: string; showName?: boolean }) {
  const name = countryName(code, language);
  if (!name) return <span className="country-unknown" aria-label={{ de: 'Land nicht angegeben', en: 'Country not specified', ru: 'Страна не указана' }[language] || 'Country not specified'}>—</span>;
  return <span className="country-label" title={name}><img className="country-flag" src={`/flags/${code!.trim().toLowerCase()}.svg`} alt={showName ? '' : name} />{showName && <span>{name}</span>}</span>;
}
