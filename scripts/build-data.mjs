// Rassemble ingrédients, recettes, villes et magasins dans web/data.js.
// Les prix de chaque magasin restent dans web/prices/ (chargés à la demande).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

const CHAINS = {
  shufersal: { he: 'שופרסל', fr: 'Shufersal', short: 'ש', color: 'red' },
  ramilevy: { he: 'רמי לוי', fr: 'Rami Levy', short: 'ר״ל', color: 'blue' },
  osherad: { he: 'אושר עד', fr: 'Osher Ad', short: 'א״ע', color: 'amber' },
};

const MIN_INGREDIENTS = 30; // un magasin doit avoir au moins 30 des 38 ingrédients
const cityMap = read('data/cities.json');

// Certaines chaînes donnent un mauvais code de ville (ex. Rami Levy « אור עקיבא » rangé à Haïfa).
// Corrections vérifiées à la main dans data/store-fixes.json.
const fixes = read('data/store-fixes.json');
function fixCity(s) {
  const code = fixes[`${s.chain}-${s.id}`];
  const c = code && cityMap[code];
  return c ? { ...s, cityCode: code, city: c.he, lat: c.lat, lon: c.lon } : s;
}

const stores = read('data/stores.json').map(fixCity)
  .filter((s) => (s.priced || 0) >= MIN_INGREDIENTS && existsSync(new URL(`web/prices/${s.chain}-${s.id}.json`, root)))
  .map((s) => ({ key: `${s.chain}-${s.id}`, chain: s.chain, name: s.name, address: s.address, city: s.city, cityCode: s.cityCode, lat: s.lat, lon: s.lon }));

const cities = Object.values(read('data/cities.json')).map((c) => ({ code: c.code, he: c.he, en: c.en, napa: c.napa, lat: c.lat, lon: c.lon }));

const data = { ingredients: read('data/ingredients.json'), recipes: read('data/recipes.json'), chains: CHAINS, stores, cities, builtAt: new Date().toISOString().slice(0, 10) };
writeFileSync(new URL('web/data.js', root), `window.DATA = ${JSON.stringify(data)};\n`);
const per = Object.keys(CHAINS).map((k) => `${CHAINS[k].fr} ${stores.filter((s) => s.chain === k).length}`).join(', ');
console.log(`web/data.js : ${data.recipes.length} recettes, ${cities.length} villes, ${stores.length} magasins (${per})`);
