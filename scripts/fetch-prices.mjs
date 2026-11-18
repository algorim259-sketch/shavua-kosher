// Récupère magasins, villes et prix de toutes les chaînes suivies.
//
//   node scripts/fetch-prices.mjs                 → tout
//   node scripts/fetch-prices.mjs --chain osherad → une seule chaîne
//   node scripts/fetch-prices.mjs --stores-only   → magasins + villes, sans les prix
//
// Les prix sont publiés par les chaînes (loi de 2014). Le serveur commun « publishedprices »
// s'ouvre avec le nom public de la chaîne, sans mot de passe.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parsePriceXml, pickProducts, decodeFile, parseStoresXml } from './prices-lib.mjs';

const run = promisify(execFile);
const root = new URL('..', import.meta.url);
const path = (p) => new URL(p, root);
const ingredients = JSON.parse(readFileSync(path('data/ingredients.json'), 'utf8'));
mkdirSync(path('web/prices/'), { recursive: true });

export const CHAINS = {
  shufersal: { he: 'שופרסל', fr: 'Shufersal', type: 'shufersal' },
  ramilevy: { he: 'רמי לוי', fr: 'Rami Levy', type: 'cerberus', user: 'RamiLevi', chainId: '7290058140886' },
  osherad: { he: 'אושר עד', fr: 'Osher Ad', type: 'cerberus', user: 'osherad', chainId: '7290103152017' },
};

const args = process.argv.slice(2);
const only = args.includes('--chain') ? args[args.indexOf('--chain') + 1] : null;
const storesOnly = args.includes('--stores-only');

async function curl(url, binary = true) {
  const { stdout } = await run('curl', ['-s', '--fail', '--max-time', '120', url], { encoding: binary ? 'buffer' : 'utf8', maxBuffer: 200 * 1024 * 1024 });
  return stdout;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } }));
}

// ---------- Shufersal (site web public) ----------
const SH = 'https://prices.shufersal.co.il/FileObject/UpdateCategory';
async function shufersalLink(cat, storeId) {
  const html = (await curl(`${SH}?catID=${cat}&storeId=${storeId}`)).toString('utf8');
  const m = html.match(/https:\/\/pricesprodpublic[^"']+/);
  return m ? m[0].replace(/&amp;/g, '&') : null;
}
const shufersal = {
  async stores() {
    const link = await shufersalLink(5, 0);
    return parseStoresXml(decodeFile(await curl(link), gunzipSync)).filter((s) => !/^BE |סיטונאות|אונליין|online/i.test(s.name));
  },
  async priceXml(store) {
    const link = await shufersalLink(2, store.id);
    if (!link) return null;
    const date = (link.match(/-(\d{8})-\d{6}\.gz/) || [])[1];
    return { xml: decodeFile(await curl(link), gunzipSync), date };
  },
};

// ---------- Serveur commun « publishedprices » (Rami Levy, Osher Ad…) ----------
const FTP = 'url.retail.publishedprices.co.il';
function cerberus(c) {
  const base = `ftp://${c.user}:@${FTP}/`;
  let listing = null;
  const list = async () => (listing ||= (await curl(base, false)).split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter(Boolean));
  return {
    async stores() {
      const f = (await list()).filter((n) => /^stores/i.test(n)).sort().pop();
      return parseStoresXml(decodeFile(await curl(base + f), gunzipSync));
    },
    async priceXml(store) {
      // Rami Levy : pricefull<chaîne>-<magasin>-<date> ; Osher Ad : PriceFull<chaîne>-<sous-chaîne>-<magasin>-<date>
      const re = new RegExp(`^pricefull${c.chainId}-(?:\\d{3}-)?0*${store.id}-(\\d{8})`, 'i');
      const f = (await list()).filter((n) => re.test(n)).sort().pop();
      if (!f) return null;
      return { xml: decodeFile(await curl(base + f), gunzipSync), date: f.match(re)[1] };
    },
  };
}
const engine = (key) => (CHAINS[key].type === 'shufersal' ? shufersal : cerberus(CHAINS[key]));

// ---------- Villes : codes officiels (data.gov.il) + position (OpenStreetMap) ----------
async function cities(codesWithStores) {
  const file = path('data/cities.json');
  const cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  if (!Object.keys(cache).length) {
    const url = 'https://data.gov.il/api/3/action/datastore_search?resource_id=5c78e9fa-c2e2-4771-93ff-7f400a12f7ba&limit=5000';
    const recs = JSON.parse((await curl(url)).toString('utf8')).result.records;
    for (const r of recs) {
      const code = String(r['סמל_ישוב']).trim();
      if (code === '0') continue;
      cache[code] = { code, he: r['שם_ישוב'].trim().replace(/\s+/g, ' '), en: (r['שם_ישוב_לועזי'] || '').trim(), napa: String(r['סמל_נפה']), council: r['סמל_מועצה_איזורית'] };
    }
  }
  // On cherche la position des villes qui ont un magasin et de toutes les villes / conseils locaux.
  const todo = Object.values(cache).filter((c) => c.lat == null && !c.triedHe && (codesWithStores.has(c.code) || c.council === 0));
  console.log(`Villes : ${Object.keys(cache).length}, positions à chercher : ${todo.length}`);
  const geocode = async (q) => {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=il,ps&format=json&limit=1`;
    await new Promise((r) => setTimeout(r, 1100)); // règle d'OpenStreetMap : 1 demande par seconde
    try {
      const { stdout } = await run('curl', ['-s', '--max-time', '30', '-A', 'repas-sportifs-dev/0.1', url], { encoding: 'utf8' });
      return JSON.parse(stdout)[0] || null;
    } catch { return null; }
  };
  for (const c of todo) {
    // d'abord le nom anglais officiel, sinon le nom hébreu (sans parenthèses)
    let r = c.en && !c.notFound ? await geocode(c.en) : null;
    if (!r) { r = await geocode(c.he.replace(/\s*\(.*?\)\s*/g, ' ').trim()); c.triedHe = true; }
    if (r) { c.lat = +(+r.lat).toFixed(4); c.lon = +(+r.lon).toFixed(4); delete c.notFound; } else c.notFound = true;
    writeFileSync(file, JSON.stringify(cache));
  }
  writeFileSync(file, JSON.stringify(cache));
  return cache;
}

// ---------- Programme ----------
const keys = only ? [only] : Object.keys(CHAINS);
const storesFile = path('data/stores.json');
let allStores = existsSync(storesFile) ? JSON.parse(readFileSync(storesFile, 'utf8')) : [];
if (!Array.isArray(allStores) || (allStores[0] && !allStores[0].chain)) allStores = [];

for (const key of keys) {
  const stores = await engine(key).stores();
  console.log(`${CHAINS[key].fr} : ${stores.length} magasins`);
  allStores = allStores.filter((s) => s.chain !== key).concat(stores.map((s) => ({ chain: key, ...s })));
}
const city = await cities(new Set(allStores.map((s) => s.cityCode)));
for (const s of allStores) {
  const c = city[s.cityCode];
  s.city = c ? c.he : '';
  if (c && c.lat != null) { s.lat = c.lat; s.lon = c.lon; }
}
writeFileSync(storesFile, JSON.stringify(allStores, null, 0));

if (!storesOnly) {
  for (const key of keys) {
    const eng = engine(key);
    const stores = allStores.filter((s) => s.chain === key);
    let ok = 0, ko = 0;
    await pool(stores, 4, async (store) => {
      try {
        const r = await eng.priceXml(store);
        if (!r) { ko++; return; }
        const items = parsePriceXml(r.xml);
        const products = pickProducts(items, ingredients);
        writeFileSync(path(`web/prices/${key}-${store.id}.json`), JSON.stringify({ date: r.date, count: items.length, products }));
        store.priced = Object.keys(products).length;
        ok++;
      } catch (e) { ko++; }
    });
    console.log(`${CHAINS[key].fr} : prix de ${ok} magasins (${ko} sans fichier)`);
  }
  writeFileSync(storesFile, JSON.stringify(allStores, null, 0));
}
