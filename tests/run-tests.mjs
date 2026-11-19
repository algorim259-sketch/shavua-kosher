// npm test — vérifie le calcul, les recettes et la composition de la semaine.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parsePriceXml, packGrams, pickProducts } from '../scripts/prices-lib.mjs';

const require = createRequire(import.meta.url);
const Plan = require('../web/plan.js');
const root = new URL('..', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

let ok = 0, ko = 0;
const t = (name, cond, extra = '') => { if (cond) ok++; else { ko++; console.log(`✗ ${name} ${extra}`); } };

const data = Plan.prepare({ ingredients: read('data/ingredients.json'), recipes: read('data/recipes.json') });
const priceFiles = readdirSync(new URL('web/prices/', root)).filter((f) => f.endsWith('.json'));
const full = priceFiles.map((f) => read(`web/prices/${f}`).products).filter((p) => data.ingredients.every((i) => p[i.id]));
const prices = full[0];
t('au moins un magasin avec tous les ingrédients', !!prices);

// --- Besoins (Mifflin-St Jeor) ---
const man = { sex: 'm', age: 25, height: 178, weight: 75, job: 'sit', sessions: '3-4', goal: 'gain', meals: 21, diet: 'all', budget: 400 };
const n = Plan.needs(man);
// BMR = 750 + 1112.5 - 125 + 5 = 1742.5 ; × 1.4 × 1.1 = 2683
t('calories homme prise de muscle', n.kcal === 2680, JSON.stringify(n));
t('protéines 1,8 g/kg', n.p === 135);
t('macros cohérentes', Math.abs(n.p * 4 + n.c * 4 + n.f * 9 - n.kcal) < 10);
const woman = Object.assign({}, man, { sex: 'f', goal: 'lose', weight: 60, height: 165, sessions: '0' });
t('femme perte de poids < 1600 kcal', Plan.needs(woman).kcal < 1600);

// --- Données ---
for (const r of data.recipes) {
  for (const id of Object.keys(r.ing)) t(`ingrédient connu ${r.id}/${id}`, !!data.ingredientsById[id]);
  const info = Plan.recipeInfo(r, data.ingredientsById, prices);
  t(`cacher : jamais viande + lait (${r.id})`, info.kosher);
  t(`calories raisonnables (${r.id})`, info.kcal > 250 && info.kcal < 1000, Math.round(info.kcal));
}
t('assez de petits-déjeuners végans', data.recipes.filter((r) => r.meal === 'breakfast' && Plan.recipeInfo(r, data.ingredientsById).vegan).length >= 1);
t('assez de plats végans', data.recipes.filter((r) => r.meal === 'main' && Plan.recipeInfo(r, data.ingredientsById).vegan).length >= 4);

// --- Fichiers de prix ---
const xml = `<Root><Items><Item><ItemCode>1</ItemCode><ItemName>ביצים ארוזות 18יח M</ItemName><Quantity>1.00</Quantity><UnitQty>יחידות</UnitQty><ItemPrice>20.10</ItemPrice><bIsWeighted>0</bIsWeighted></Item>
<Item><ItemCode>2</ItemCode><ItemName>קוטג 5% שומן 250ג טרה</ItemName><Quantity>250.00</Quantity><UnitQty>גרם</UnitQty><ItemPrice>6.70</ItemPrice><bIsWeighted>0</bIsWeighted></Item>
<Item><ItemCode>3</ItemCode><ItemName>גבינת קוטג%5מהדרין250גר</ItemName><Quantity>250.00</Quantity><UnitQty>גרם</UnitQty><ItemPrice>6.40</ItemPrice><bIsWeighted>0</bIsWeighted></Item>
<Item><ItemCode>4</ItemCode><ItemName>בננה</ItemName><Quantity>1.00</Quantity><UnitQty>קילוגרם</UnitQty><ItemPrice>12.90</ItemPrice><bIsWeighted>1</bIsWeighted></Item>
<Item><ItemCode>5</ItemCode><ItemName>תפוזינה תות בננה 1.5ליטר</ItemName><Quantity>1.50</Quantity><UnitQty>ליטר</UnitQty><ItemPrice>8.90</ItemPrice><bIsWeighted>0</bIsWeighted></Item></Items></Root>`;
const items = parsePriceXml(xml);
t('lecture XML', items.length === 5 && items[0].price === 20.1);
t('œufs : 18 × 60 g', packGrams(items[0], data.ingredientsById.eggs) === 1080);
const picked = pickProducts(items, data.ingredients);
t('cottage le moins cher', picked.cottage && picked.cottage.code === '3');
t('banane : pas la boisson', picked.banana && picked.banana.code === '4');

// --- Erreurs déjà rencontrées dans les vrais fichiers ---
const it = (code, name, qty, unit, price, w = 0) => `<Item><ItemCode>${code}</ItemCode><ItemName>${name}</ItemName><Quantity>${qty}</Quantity><UnitQty>${unit}</UnitQty><ItemPrice>${price}</ItemPrice><bIsWeighted>${w}</bIsWeighted></Item>`;
const traps = parsePriceXml(`<Root><Items>
${it('a', 'ת.רחצה מלפפון750מ לה מון', '750', 'מיליליטר', '1.00')}${it('b', 'מלפפון', '1', 'קילוגרם', '7.90', 1)}
${it('c', 'חטיף ברונו לכלבים נקניקיות ברווז ותרד 80', '', '', '1.00', 1)}${it('d', 'עלי תרד בייבי 400 גר (ק)', '400', 'גרם', '15.90')}
${it('e', 'אפרסק פיתה', '1', 'קילוגרם', '1.00', 1)}${it('f', 'פיתות של פעם10*100ג אנגל', '1000', 'גרם', '13.90')}
${it('g', 'בשר טחון עוף ארוז 1 קג בלדי', '', '', '1.00')}${it('h', 'בשר בקר טחון קפוא', '1', 'קילוגרם', '39.90', 1)}
${it('i', 'קמח תפוח אדמה 500', '500', 'גרם', '1.00')}${it('j', 'תפוח אדמה לבן ארוז', '1', 'קילוגרם', '4.50', 1)}
</Items></Root>`);
const tp = pickProducts(traps, data.ingredients);
t('pas de gel douche pour les concombres', tp.cucumber && tp.cucumber.code === 'b');
t('pas de friandise pour chien pour les épinards', tp.spinach && tp.spinach.code === 'd');
t('pas de pêche pour les pitas', tp.pita && tp.pita.code === 'f');
t('pas de poulet haché pour le bœuf', tp.beef && tp.beef.code === 'h');
t('pas de fécule pour les pommes de terre', tp.potato && tp.potato.code === 'j');
const { gramsFromName } = await import('../scripts/prices-lib.mjs');
t('quantité lue dans le nom', gramsFromName('אורז פרסי 1 קג') === 1000 && gramsFromName('יוגורט יווני 600 גר גד') === 600 && gramsFromName('טונה במים רביעייה 4*160 גר') === 640);

// --- Semaine ---
const plan = Plan.buildPlan(man, data, prices, 42, 150);
t('7 jours', plan.days.length === 7);
t('3 repas par jour', plan.days.every((d) => d.meals.length === 3));
t('jamais plus de 2 fois la même recette', (() => { const c = {}; plan.days.forEach((d) => d.meals.forEach((m) => (c[m.id] = (c[m.id] || 0) + 1))); return Object.values(c).every((v) => v <= 2); })());
t('budget respecté', plan.shop.total <= man.budget, `${plan.shop.total} ₪`);
t('budget minimum calculé', plan.minBudget > 50 && plan.minBudget <= plan.shop.total + 10, `${plan.minBudget}`);
t('même graine = même semaine', JSON.stringify(Plan.buildPlan(man, data, prices, 42, 150).days) === JSON.stringify(plan.days));
const vegan = Plan.buildPlan(Object.assign({}, man, { diet: 'vegan' }), data, prices, 7, 100);
t('végan : aucun produit animal', vegan.days.every((d) => d.meals.every((m) => Object.keys(m.ing).every((k) => { const i = data.ingredientsById[k]; return i.kosher === 'parve' && !i.animal; }))));
const poor = Plan.buildPlan(Object.assign({}, man, { budget: 50 }), data, prices, 3, 100);
t('budget trop bas signalé', poor.overBudget === true);
const swapped = Plan.swapMeal(plan, man, data, prices, 0, 1, 99);
t('remplacer un repas', swapped.days[0].meals[1].id !== plan.days[0].meals[1].id && swapped.days[1] === plan.days[1]);

// --- Variété et préférences d'aliments ---
const ids21 = plan.days.flatMap((d) => d.meals.map((m) => m.id));
t('variété : 21 repas, au moins 18 plats différents', new Set(ids21).size >= 18, new Set(ids21).size);
const noFish = Object.assign({}, man, { foods: { salmon: -1, tuna: -1 } });
const pf = Plan.buildPlan(noFish, data, prices, 11, 100);
t('aliment pas aimé : jamais dans la semaine', pf.days.every((d) => d.meals.every((m) => !m.ing.salmon && !m.ing.tuna)));
t('aliment pas aimé : jamais dans les 3 choix', [0, 1, 2].every((mi) => Plan.mealOptions(pf, noFish, data, prices, 0, mi, 3, 4).every((o) => !o.ing.salmon && !o.ing.tuna)));
const loveTofu = Object.assign({}, man, { foods: { tofu: 1 } });
const countTofu = (p) => p.days.reduce((s, d) => s + d.meals.filter((m) => m.ing.tofu).length, 0);
t('aliment aimé : plus souvent dans la semaine', [1, 2, 3].reduce((s, sd) => s + countTofu(Plan.buildPlan(loveTofu, data, prices, sd, 60)), 0) > [1, 2, 3].reduce((s, sd) => s + countTofu(Plan.buildPlan(man, data, prices, sd, 60)), 0));
const hatesAll = Object.assign({}, man, { foods: Object.fromEntries(Plan.FOOD_CHOICES.map((id) => [id, -1])) });
const ha = Plan.buildPlan(hatesAll, data, prices, 1, 40);
t('tout refuser ne bloque pas l\'app (semaine quand même)', !ha.error && ha.days.length === 7);
t('liste des aliments : tous connus', Plan.FOOD_CHOICES.every((id) => data.ingredientsById[id]));

// --- Choisir parmi 3 plats ---
const cur = plan.days[0].meals[1];
const opts = Plan.mealOptions(plan, man, data, prices, 0, 1, 3, 5);
t('3 plats proposés', opts.length === 3, opts.length);
t('jamais le plat actuel dans les choix', opts.every((o) => o.id !== cur.id));
t('3 plats différents', new Set(opts.map((o) => o.id)).size === 3);
t('même type de repas (midi reste un plat)', opts.every((o) => o.slot === cur.slot && data.recipes.find((r) => r.id === o.id).meal === 'main'));
t('« d\'autres idées » propose d\'autres plats', [6, 7, 8, 9].some((sd) => JSON.stringify(Plan.mealOptions(plan, man, data, prices, 0, 1, 3, sd).map((o) => o.id)) !== JSON.stringify(opts.map((o) => o.id))));
const bOpts = Plan.mealOptions(plan, man, data, prices, 0, 0, 3, 5);
t('petit-déjeuner : choix parmi les petits-déjeuners', bOpts.length > 0 && bOpts.every((o) => data.recipes.find((r) => r.id === o.id).meal === 'breakfast'));
const chosen = Plan.chooseMeal(plan, man, data, prices, 0, 1, opts[2].id);
t('le plat choisi remplace le repas', chosen.days[0].meals[1].id === opts[2].id && chosen.days[0].meals[0] === plan.days[0].meals[0] && chosen.days[1] === plan.days[1]);
t('les courses tiennent compte du plat choisi', Object.keys(opts[2].ing).every((k) => chosen.shop.lines.some((l) => l.id === k)));
t('recette inconnue : rien ne change', Plan.chooseMeal(plan, man, data, prices, 0, 1, 'nexiste-pas') === plan);
const veg = Plan.buildPlan(Object.assign({}, man, { diet: 'vegan' }), data, prices, 7, 60);
t('végan : choix uniquement végans', Plan.mealOptions(veg, Object.assign({}, man, { diet: 'vegan' }), data, prices, 0, 1, 3, 1).every((o) => Plan.recipeInfo(data.recipes.find((r) => r.id === o.id), data.ingredientsById).vegan));
const two = Plan.buildPlan(Object.assign({}, man, { meals: 14 }), data, prices, 5, 100);
t('14 repas = déjeuner + dîner', two.days.every((d) => d.meals.length === 2 && d.meals[0].slot === 'lunch'));

// --- Famille ---
t('enfant 2 ans < enfant 10 ans < ado 16 ans', Plan.childKcal(2) < Plan.childKcal(10) && Plan.childKcal(10) < Plan.childKcal(16));
const mom = { type: 'adult', sex: 'f', age: 35, height: 165, weight: 60 };
// 600 + 1031.25 - 175 - 161 = 1295.25 ; × 1,4 = 1813 → 1810
t('autre adulte : Mifflin × 1,4', Plan.memberKcal(mom) === 1810, Plan.memberKcal(mom));
const famProfile = Object.assign({}, man, { members: [mom, { type: 'child', age: 6 }, { type: 'child', age: 12 }], budget: Infinity });
const fam = Plan.buildPlan(famProfile, data, prices, 42, 80);
const famF = (2680 + 1810 + Plan.childKcal(6) + Plan.childKcal(12)) / 2680;
t('facteur famille (toi + 1 adulte + 2 enfants)', Math.abs(fam.needs.fam - famF) < 0.01, fam.needs.fam);
const m0 = fam.days[0].meals[0], k0 = Object.keys(m0.ing)[0];
t('quantités famille = ta portion × facteur', Math.abs(m0.ing[k0] - m0.mine[k0] * famF) <= famF);
t('un adulte plus lourd mange plus', Plan.memberKcal(Object.assign({}, mom, { weight: 90 })) > Plan.memberKcal(mom));
// on compare ce qui est mangé (une personne seule garde plus de paquets entamés à la maison)
t('la famille mange bien plus que solo', fam.shop.eaten > Plan.buildPlan(Object.assign({}, man, { budget: Infinity }), data, prices, 42, 80).shop.eaten * 2);
t('solo : facteur 1', Plan.buildPlan(man, data, prices, 42, 40).needs.fam === 1);

// --- Comparaison des magasins ---
const cmp = Plan.compareStores(plan.days, data, { a: prices, b: full[1] || prices, c: {} });
t('comparaison : magasin incomplet écarté', cmp.length === 2 && !cmp.find((x) => x.key === 'c'));
t('comparaison triée du moins cher au plus cher', cmp[0].total <= cmp[1].total);
const rp = Plan.repriceDays(plan.days, data, prices);
t('prix des repas recalculés', rp[0].meals[0].cost > 0 && rp[0].meals.length === plan.days[0].meals.length);

// --- Magasins et distances ---
const { parseStoresXml, km, decodeFile } = await import('../scripts/prices-lib.mjs');
const st = parseStoresXml('<Root><Store><StoreID>039</StoreID><StoreName>חדרה</StoreName><Address>הנשיא 1</Address><City>6500</City></Store></Root>');
t('lecture des magasins', st.length === 1 && st[0].id === 39 && st[0].cityCode === '6500');
t('UTF-16 décodé', decodeFile(Buffer.from('﻿<a>שלום</a>', 'utf16le'), (b) => b) === '<a>שלום</a>');
t('distance Hadera – Or Akiva ≈ 8 km', Math.abs(km({ lat: 32.434, lon: 34.919 }, { lat: 32.507, lon: 34.918 }) - 8) < 1.5);

console.log(`\n${ok} réussis, ${ko} ratés`);
console.log(`Exemple : ${plan.needs.kcal} kcal/jour, semaine à ${plan.shop.total} ₪ (minimum ${plan.minBudget} ₪), protéines ${plan.protein} % de l'objectif`);
process.exit(ko ? 1 : 0);
