// Lecture des fichiers de prix publiés par les supermarchés (loi israélienne de 2014).
// Fonctions pures : testables sans internet.

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
   .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
};

// Transforme le XML « PriceFull » en liste de produits.
export function parsePriceXml(xml) {
  const items = [];
  const re = /<Item>([\s\S]*?)<\/Item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    items.push({
      code: tag(b, 'ItemCode'),
      name: tag(b, 'ItemName'),
      qty: parseFloat(tag(b, 'Quantity')) || 0,
      unit: tag(b, 'UnitQty'),
      price: parseFloat(tag(b, 'ItemPrice')) || 0,
      weighted: tag(b, 'bIsWeighted') === '1',
    });
  }
  return items;
}

// Poids d'un paquet en grammes (les liquides : 1 ml ≈ 1 g). null si inconnu.
export function packGrams(item, ing) {
  if (item.weighted) return 1000; // prix au kilo
  const u = item.unit;
  if (/קילו|ק"ג|ליטר/.test(u) && !/מיליליטר/.test(u)) return item.qty * 1000;
  if (/גרם|מיליליטר|מ"ל/.test(u)) return item.qty;
  if (/יחיד/.test(u)) {
    if (!ing.unitG) return null;
    const n = item.name.match(/(\d+)\s*יח/);
    const count = n ? parseInt(n[1], 10) : item.qty > 1 ? item.qty : 0;
    return count > 1 ? count * ing.unitG : null;
  }
  // Unité inconnue (Osher Ad : « לא ידוע ») : un petit nombre = kilos ou litres, sinon grammes.
  if (item.qty > 0) return item.qty <= 10 ? item.qty * 1000 : item.qty;
  return null;
}

const matches = (name, ing) =>
  ing.match.some((alt) => alt.every((k) => name.includes(k))) &&
  !(ing.exclude || []).some((k) => name.includes(k));

// Pour chaque ingrédient, le produit le moins cher au kilo dans ce magasin.
export function pickProducts(items, ingredients) {
  const out = {};
  for (const ing of ingredients) {
    let best = null;
    for (const it of items) {
      if (!it.price || !matches(it.name, ing)) continue;
      if (ing.onlyWeighted && !it.weighted) continue;
      const g = packGrams(it, ing);
      if (!g || g < (ing.minPackG || 0)) continue;
      if (!it.weighted && g > (ing.maxPackG || 2000)) continue; // pas de seau de 3 kg pour une semaine
      const perKg = (it.price / g) * 1000;
      if (ing.maxPerKg && perKg > ing.maxPerKg) continue;
      if (!best || perKg < best.perKg) {
        best = { code: it.code, name: it.name, price: it.price, packG: Math.round(g), weighted: it.weighted, perKg: Math.round(perKg * 100) / 100 };
      }
    }
    if (best) out[ing.id] = best;
  }
  return out;
}

// Décompresse si besoin et décode (certaines chaînes écrivent en UTF-16).
export function decodeFile(buf, gunzip) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzip(buf);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  return buf.toString('utf8').replace(/^﻿/, '');
}

// Liste des magasins d'une chaîne (fichier « Stores »). City = code officiel de la ville.
export function parseStoresXml(xml) {
  const out = [];
  const re = /<(?:Store|STORE)>([\s\S]*?)<\/(?:Store|STORE)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const id = parseInt(tag(b, 'StoreID') || tag(b, 'STOREID'), 10);
    if (!id && id !== 0) continue;
    out.push({ id, name: tag(b, 'StoreName') || tag(b, 'STORENAME'), address: tag(b, 'Address') || tag(b, 'ADDRESS'), cityCode: (tag(b, 'City') || tag(b, 'CITY')).replace(/^0+/, '') });
  }
  return out;
}

// Distance en km entre deux points (formule de haversine).
export function km(a, b) {
  const r = (x) => (x * Math.PI) / 180;
  const d = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(d));
}
