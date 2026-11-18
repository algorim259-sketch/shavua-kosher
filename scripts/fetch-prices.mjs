// Télécharge les prix Shufersal (fichiers publics, sans compte) pour quelques magasins
// et garde, pour chaque ingrédient, le produit le moins cher au kilo.
//
//   node scripts/fetch-prices.mjs              → les magasins de data/stores.json
//   node scripts/fetch-prices.mjs --file x.gz  → un fichier déjà téléchargé (test)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parsePriceXml, pickProducts } from './prices-lib.mjs';

const root = new URL('..', import.meta.url);
const ingredients = JSON.parse(readFileSync(new URL('data/ingredients.json', root), 'utf8'));
const stores = JSON.parse(readFileSync(new URL('data/stores.json', root), 'utf8'));
mkdirSync(new URL('data/prices/', root), { recursive: true });

const BASE = 'https://prices.shufersal.co.il';

async function fetchStoreXml(storeId) {
  // La page renvoie un lien signé (valable quelques heures) vers le fichier « PriceFull ».
  const html = await (await fetch(`${BASE}/FileObject/UpdateCategory?catID=2&storeId=${storeId}`)).text();
  const m = html.match(/https:\/\/pricesprodpublic[^"']+/);
  if (!m) throw new Error(`pas de fichier pour le magasin ${storeId}`);
  const url = m[0].replace(/&amp;/g, '&');
  const date = (url.match(/-(\d{8})-\d{6}\.gz/) || [])[1] || '';
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  return { xml: gunzipSync(buf).toString('utf8'), date };
}

function save(store, xml, date) {
  const items = parsePriceXml(xml);
  const products = pickProducts(items, ingredients);
  const missing = ingredients.filter((i) => !products[i.id]).map((i) => i.id);
  const out = { chain: 'shufersal', storeId: store.id, name: store.name, city: store.city, date, count: items.length, products };
  writeFileSync(new URL(`data/prices/shufersal-${store.id}.json`, root), JSON.stringify(out, null, 1));
  console.log(`✓ ${store.name} : ${items.length} produits, ${Object.keys(products).length}/${ingredients.length} ingrédients trouvés` +
    (missing.length ? ` — manquants : ${missing.join(', ')}` : ''));
}

const fileArg = process.argv.indexOf('--file');
if (fileArg > 0) {
  const xml = gunzipSync(readFileSync(process.argv[fileArg + 1])).toString('utf8');
  save(stores[0], xml, 'local');
} else {
  for (const store of stores) {
    try {
      const { xml, date } = await fetchStoreXml(store.id);
      save(store, xml, date);
    } catch (e) {
      console.log(`✗ ${store.name} : ${e.message}`);
    }
  }
}
