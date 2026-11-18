// Contrôle : pour chaque ingrédient, quels produits ont été choisis dans les magasins ?
// Sert à repérer les erreurs (ex. « épinards » = friandise pour chien).
//   node scripts/review-products.mjs            → tous les ingrédients
//   node scripts/review-products.mjs spinach    → un seul
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const only = process.argv[2];
const ingredients = JSON.parse(readFileSync(new URL('data/ingredients.json', root), 'utf8'));
const files = readdirSync(new URL('web/prices/', root)).filter((f) => f.endsWith('.json'));
const by = {};
for (const f of files) {
  const chain = f.split('-')[0];
  const { products } = JSON.parse(readFileSync(new URL(`web/prices/${f}`, root), 'utf8'));
  for (const [id, p] of Object.entries(products)) {
    const k = `${chain} | ${p.name}`;
    ((by[id] ||= {})[k] ||= { n: 0, perKg: p.perKg, packG: p.packG }).n++;
  }
}
for (const ing of ingredients) {
  if (only && ing.id !== only) continue;
  const rows = Object.entries(by[ing.id] || {}).sort((a, b) => b[1].n - a[1].n);
  console.log(`\n== ${ing.id} (${ing.fr}) — ${rows.length} produits différents`);
  for (const [k, v] of rows.slice(0, 12)) console.log(`  ${String(v.n).padStart(3)}× ${k}  (${v.packG} g, ${v.perKg} ₪/kg)`);
}
