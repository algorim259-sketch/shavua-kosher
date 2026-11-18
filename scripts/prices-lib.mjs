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
  if (/יחיד/.test(u) && ing.unitG) {
    const n = item.name.match(/(\d+)\s*יח/);
    const count = n ? parseInt(n[1], 10) : 0;
    return count > 1 ? count * ing.unitG : null;
  }
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
