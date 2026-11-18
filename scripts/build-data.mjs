// Rassemble ingrédients, recettes et prix dans web/data.js
// (le site s'ouvre alors d'un double-clic, sans serveur).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

const stores = [];
const prices = {};
for (const f of readdirSync(new URL('data/prices/', root)).filter((f) => f.endsWith('.json'))) {
  const s = read(`data/prices/${f}`);
  const key = `${s.chain}-${s.storeId}`;
  stores.push({ key, chain: s.chain, name: s.name, city: s.city, date: s.date });
  prices[key] = s.products;
}

const data = { ingredients: read('data/ingredients.json'), recipes: read('data/recipes.json'), stores, prices, builtAt: new Date().toISOString().slice(0, 10) };
writeFileSync(new URL('web/data.js', root), `window.DATA = ${JSON.stringify(data)};\n`);
console.log(`web/data.js : ${data.recipes.length} recettes, ${data.ingredients.length} ingrédients, ${stores.length} magasins`);
