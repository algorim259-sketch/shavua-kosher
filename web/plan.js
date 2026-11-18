// Calcul des besoins et composition de la semaine.
// Fonctionne dans le navigateur (window.Plan) et dans Node (tests).
(function (root) {
  'use strict';

  // ---------- Besoins du jour ----------
  const JOB = { sit: 1.2, stand: 1.375, physical: 1.55 };
  const SESSIONS = { '0': 0, '1-2': 0.1, '3-4': 0.2, '5+': 0.3 };
  const GOAL_KCAL = { lose: 0.8, fit: 1, gain: 1.1 };
  const GOAL_PROT = { lose: 2.0, fit: 1.6, gain: 1.8 }; // g par kg de poids

  function needs(p) {
    // Formule de Mifflin-St Jeor (métabolisme de base)
    const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5);
    const factor = (JOB[p.job] || 1.2) + (SESSIONS[p.sessions] || 0);
    const kcal = Math.round((bmr * factor * (GOAL_KCAL[p.goal] || 1)) / 10) * 10;
    const prot = Math.round(p.weight * (GOAL_PROT[p.goal] || 1.6));
    const fat = Math.round((kcal * 0.25) / 9);
    const carbs = Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4));
    return { kcal, p: prot, c: carbs, f: fat };
  }

  // ---------- Repas de la semaine ----------
  // Part des calories du jour couverte par chaque repas (le reste : collations, à toi de gérer).
  const SLOTS = {
    7: [['dinner', 0.4]],
    14: [['lunch', 0.4], ['dinner', 0.4]],
    21: [['breakfast', 0.25], ['lunch', 0.375], ['dinner', 0.375]],
  };
  const COMFORT = new Set(['bolognese', 'chickpea-curry', 'mujadara', 'stuffed-sweetpotato', 'chicken-potato', 'beef-rice', 'cheesy-pasta', 'tofu-pasta', 'shakshuka']);
  const TAGS = ['express', 'protein', 'balanced', 'light', 'comfort', 'cheap'];

  function recipeInfo(r, ings, prices) {
    let kcal = 0, p = 0, c = 0, f = 0, grams = 0, cost = 0;
    let meat = false, dairy = false, fish = false, animal = false;
    for (const [id, g] of Object.entries(r.ing)) {
      const i = ings[id];
      kcal += (i.kcal * g) / 100; p += (i.p * g) / 100; c += (i.c * g) / 100; f += (i.f * g) / 100;
      grams += g;
      if (prices && prices[id]) cost += (prices[id].perKg * g) / 1000;
      if (i.kosher === 'meat') meat = true;
      if (i.kosher === 'dairy') dairy = true;
      if (i.kosher === 'fish') fish = true;
      if (i.animal) animal = true;
    }
    const vegetarian = !meat && !fish;
    const vegan = vegetarian && !dairy && !animal;
    const kosher = !(meat && dairy) && !(meat && fish);
    const tags = {
      express: r.min <= 15,
      protein: (p * 4) / kcal >= 0.3,
      balanced: (p * 4) / kcal >= 0.2 && (c * 4) / kcal >= 0.3,
      light: kcal / grams < 1.3,
      comfort: COMFORT.has(r.id),
      cheap: (cost / kcal) * 600 < 7, // moins de 7 ₪ pour 600 kcal
    };
    return { kcal, p, c, f, cost, vegetarian, vegan, kosher, type: meat ? 'meat' : dairy ? 'dairy' : 'parve', tags };
  }

  function allowed(info, diet) {
    if (diet === 'vegan') return info.vegan;
    if (diet === 'vegetarian') return info.vegetarian;
    if (diet === 'kosher') return info.kosher;
    return true;
  }

  // Générateur aléatoire avec graine : même graine = même semaine.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function candidates(profile, data, prices) {
    const ings = data.ingredientsById;
    const out = { breakfast: [], main: [] };
    for (const r of data.recipes) {
      if (!Object.keys(r.ing).every((id) => prices[id])) continue; // ingrédient absent du magasin
      const info = recipeInfo(r, ings, prices);
      if (!allowed(info, profile.diet)) continue;
      const likes = profile.likes || {};
      let w = 1;
      for (const t of TAGS) {
        if (!info.tags[t]) continue;
        if (likes[t] === true) w += 1.5;
        if (likes[t] === false) w -= 0.4;
      }
      if (profile.goal === 'gain' || profile.goal === 'lose') w += info.tags.protein ? 1 : 0;
      out[r.meal].push({ r, info, w: Math.max(0.2, w) });
    }
    return out;
  }

  const scaleFor = (target, kcal) => Math.min(2.2, Math.max(0.6, target / kcal));

  // Famille : mêmes plats pour tout le monde, quantités multipliées selon les besoins de chacun.
  // Enfant : repères moyens par âge (kcal/jour, filles et garçons confondus, activité normale).
  const CHILD_TABLE = [[1, 900], [3, 1100], [5, 1300], [8, 1550], [11, 1850], [13, 2100], [17, 2350]];
  function childKcal(age) {
    for (const [maxAge, kcal] of CHILD_TABLE) if (age <= maxAge) return kcal;
    return 2350;
  }
  // Autre adulte : Mifflin-St Jeor avec son poids, sa taille, son âge, activité légère (× 1,4).
  function adultKcal(m) {
    const bmr = 10 * (m.weight || 70) + 6.25 * (m.height || 170) - 5 * (m.age || 35) + (m.sex === 'f' ? -161 : 5);
    return Math.round((bmr * 1.4) / 10) * 10;
  }
  function memberKcal(m) { return m.type === 'child' ? childKcal(m.age || 8) : adultKcal(m); }
  function familyFactor(profile, daily) {
    const members = Array.isArray(profile.members) ? profile.members : [];
    return (daily.kcal + members.reduce((s, m) => s + memberKcal(m), 0)) / daily.kcal;
  }

  // kcal et protéines = TA portion ; ing et cost = pour toute la famille ; mine = tes grammes.
  function makeMeal(cand, slot, share, daily) {
    const factor = scaleFor(daily.kcal * share, cand.info.kcal);
    const fam = daily.fam || 1;
    return {
      slot, id: cand.r.id, he: cand.r.he, fr: cand.r.fr, min: cand.r.min, type: cand.info.type,
      factor: Math.round(factor * 100) / 100,
      kcal: Math.round(cand.info.kcal * factor), p: Math.round(cand.info.p * factor),
      cost: Math.round(cand.info.cost * factor * fam * 100) / 100,
      ing: Object.fromEntries(Object.entries(cand.r.ing).map(([k, g]) => [k, Math.round(g * factor * fam)])),
      mine: Object.fromEntries(Object.entries(cand.r.ing).map(([k, g]) => [k, Math.round(g * factor)])),
    };
  }

  function pick(list, rand, used, prev, weightFn) {
    const ok = list.filter((c) => (used[c.r.id] || 0) < 2 && c.r.id !== prev);
    const pool = ok.length ? ok : list;
    const total = pool.reduce((s, c) => s + weightFn(c), 0);
    let x = rand() * total;
    for (const c of pool) { x -= weightFn(c); if (x <= 0) return c; }
    return pool[pool.length - 1];
  }

  function randomWeek(profile, data, cands, daily, rand, weightFn) {
    const slots = SLOTS[profile.meals] || SLOTS[21];
    const used = {}; const prev = {};
    const days = [];
    for (let d = 0; d < 7; d++) {
      const meals = [];
      for (const [slot, share] of slots) {
        const kind = slot === 'breakfast' ? 'breakfast' : 'main';
        const c = pick(cands[kind], rand, used, prev[kind], weightFn);
        used[c.r.id] = (used[c.r.id] || 0) + 1; prev[kind] = c.r.id;
        meals.push(makeMeal(c, slot, share, daily));
      }
      days.push({ meals });
    }
    return days;
  }

  // Liste de courses : on achète des paquets entiers (ou au poids, arrondi à 100 g).
  function shopping(days, data, prices) {
    const grams = {};
    for (const d of days) for (const m of d.meals) for (const [k, g] of Object.entries(m.ing)) grams[k] = (grams[k] || 0) + g;
    const lines = [];
    let total = 0, eaten = 0;
    for (const [id, g] of Object.entries(grams)) {
      const pr = prices[id]; const ing = data.ingredientsById[id];
      let buy, packs = null, cost;
      if (pr.weighted) { buy = Math.ceil(g / 100) * 100; cost = (pr.perKg * buy) / 1000; }
      else { packs = Math.ceil(g / pr.packG); buy = packs * pr.packG; cost = packs * pr.price; }
      cost = Math.round(cost * 100) / 100;
      total += cost; eaten += (pr.perKg * g) / 1000;
      lines.push({ id, he: ing.he, fr: ing.fr, aisle: ing.aisle, need: g, buy, packs, product: pr.name, price: pr.price, packG: pr.packG, weighted: pr.weighted, cost });
    }
    const ORDER = ['produce', 'meat', 'fish', 'dairy', 'bakery', 'dry'];
    lines.sort((a, b) => ORDER.indexOf(a.aisle) - ORDER.indexOf(b.aisle) || b.cost - a.cost);
    return { lines, total: Math.round(total * 100) / 100, eaten: Math.round(eaten * 100) / 100 };
  }

  function score(days, daily, profile) {
    const slots = SLOTS[profile.meals] || SLOTS[21];
    const share = slots.reduce((s, x) => s + x[1], 0);
    const target = daily.p * share * 7;
    const got = days.reduce((s, d) => s + d.meals.reduce((t, m) => t + m.p, 0), 0);
    return Math.min(1, got / target); // 1 = objectif protéines atteint
  }

  function buildPlan(profile, data, prices, seed, tries) {
    tries = tries || 300;
    const daily = needs(profile);
    daily.fam = Math.round(familyFactor(profile, daily) * 1000) / 1000;
    const cands = candidates(profile, data, prices);
    if (!cands.main.length || ((profile.meals || 21) === 21 && !cands.breakfast.length)) return { error: 'no-recipes', needs: daily };
    const rand = rng(seed || 1);

    // 1) Budget minimum : on cherche la semaine la moins chère possible.
    let cheapest = Infinity;
    const cheapW = (c) => 1 / Math.pow(c.info.cost / c.info.kcal * 600 + 1, 3);
    for (let i = 0; i < tries; i++) {
      const days = randomWeek(profile, data, cands, daily, rand, cheapW);
      cheapest = Math.min(cheapest, shopping(days, data, prices).total);
    }

    // 2) La meilleure semaine qui tient dans le budget. Si rien ne rentre,
    //    on favorise de plus en plus les recettes bon marché.
    let best = null, fallback = null;
    const per = Math.ceil(tries / 2);
    for (let i = 0; i < per * 4 && !(best && i >= per); i++) {
      const alpha = Math.floor(i / per); // 0, 1, 2, 3
      const days = randomWeek(profile, data, cands, daily, rand, (c) => c.w * Math.pow(cheapW(c), alpha / 3));
      const shop = shopping(days, data, prices);
      const prefs = days.reduce((s, d) => s + d.meals.reduce((t, m) => t + (cands[m.slot === 'breakfast' ? 'breakfast' : 'main'].find((c) => c.r.id === m.id).w), 0), 0);
      const sc = score(days, daily, profile) * 100 + prefs * 0.5 - shop.total * 0.05;
      const plan = { days, shop, sc };
      if (shop.total <= profile.budget && (!best || sc > best.sc)) best = plan;
      if (!fallback || shop.total < fallback.shop.total) fallback = plan;
    }
    const chosen = best || fallback;
    return {
      needs: daily,
      days: chosen.days,
      shop: chosen.shop,
      protein: Math.round(score(chosen.days, daily, profile) * 100),
      minBudget: Math.ceil(Math.min(cheapest, fallback.shop.total) / 10) * 10,
      overBudget: !best,
    };
  }

  // Remplacer un repas par une autre recette du même type.
  function swapMeal(plan, profile, data, prices, dayIdx, mealIdx, seed) {
    const daily = plan.needs;
    const cands = candidates(profile, data, prices);
    const m = plan.days[dayIdx].meals[mealIdx];
    const kind = m.slot === 'breakfast' ? 'breakfast' : 'main';
    const share = (SLOTS[profile.meals] || SLOTS[21]).find((s) => s[0] === m.slot)[1];
    const list = cands[kind].filter((c) => c.r.id !== m.id);
    if (!list.length) return plan;
    const c = pick(list, rng(seed), {}, null, (x) => x.w);
    const days = plan.days.map((d, i) => (i !== dayIdx ? d : { meals: d.meals.map((x, j) => (j === mealIdx ? makeMeal(c, m.slot, share, daily) : x)) }));
    const shop = shopping(days, data, prices);
    return Object.assign({}, plan, { days, shop, protein: Math.round(score(days, daily, profile) * 100), overBudget: shop.total > profile.budget });
  }

  // Même semaine, même liste : combien ça coûte dans chaque magasin ?
  // pricesByStore = { cléMagasin: prix } ; un magasin à qui il manque un ingrédient est écarté.
  function compareStores(days, data, pricesByStore) {
    const need = new Set();
    for (const d of days) for (const m of d.meals) for (const k of Object.keys(m.ing)) need.add(k);
    const out = [];
    for (const [key, prices] of Object.entries(pricesByStore)) {
      if (!prices || ![...need].every((k) => prices[k])) continue;
      out.push({ key, total: shopping(days, data, prices).total });
    }
    return out.sort((a, b) => a.total - b.total);
  }

  // Coût de chaque repas recalculé avec les prix d'un autre magasin.
  function repriceDays(days, data, prices) {
    return days.map((d) => ({ meals: d.meals.map((m) => Object.assign({}, m, {
      cost: Math.round(Object.entries(m.ing).reduce((s, [k, g]) => s + (prices[k].perKg * g) / 1000, 0) * 100) / 100,
    })) }));
  }

  function prepare(raw) {
    const ingredientsById = {};
    for (const i of raw.ingredients) ingredientsById[i.id] = i;
    return Object.assign({}, raw, { ingredientsById });
  }

  const api = { needs, familyFactor, memberKcal, childKcal, recipeInfo, buildPlan, swapMeal, shopping, compareStores, repriceDays, prepare, rng, SLOTS, TAGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Plan = api;
})(typeof window !== 'undefined' ? window : this);
